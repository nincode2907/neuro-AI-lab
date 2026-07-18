/**
 * hillclimb.js — Environment Hill Climb Racing (bản đơn giản hoá, đồ hoạ mặc định).
 *
 * Cơ chế cốt lõi của game gốc mà bản này giữ lại: xe có 1 THAN TRÊN (thân xe)
 * có thể XOAY quanh điểm tiếp đất, và GA (ga) tạo mô-men xoắn làm ngóc đầu xe
 * lên — đi lên dốc mà ga quá mạnh sẽ LẬT NGỬA ra sau (crash). PHANH tạo mô-men
 * ngược lại (cúi đầu xe xuống) — dùng để "hạ cánh" khi xe đang chổng lên.
 * Đây chính là hành vi thú vị để quan sát AI học: ga vừa đủ để leo dốc mà
 * không lật.
 *
 * ĐỊA HÌNH: sinh "vô hạn" bằng hàm băm tất định (seed, index) -> số ngẫu
 * nhiên — không cần mảng lưu trước, độ cao tại bất kỳ x nào tính trực tiếp.
 * Cùng seed => cả quần thể chạy trên CÙNG một dải đồi mỗi thế hệ (công bằng).
 *
 * ĐƠN GIẢN HOÁ CÓ CHỦ ĐÍCH: xe không có phương trình rơi tự do/va chạm đầy đủ
 * như vật lý thật — điểm tựa (trục xe) luôn bám theo độ cao địa hình tại vị
 * trí x hiện tại, chỉ riêng GÓC NGHIÊNG thân xe là bậc tự do được mô phỏng
 * (lò xo kéo về góc mặt đường khi bánh còn bám, tách ra khi nghiêng quá đà).
 * Giữ mức độ chi tiết tương đương Flappy/Snake — không mô phỏng khí động học
 * hay va chạm thật, chỉ giữ đúng MỘT cơ chế học thú vị nhất của game gốc.
 *
 * Interface chung: xem mô tả đầu flappy.js.
 */

/** Băm tất định (seed, index) -> số trong [0,1) — địa hình không cần mảng lưu trước. */
function hash01(seed, index) {
  let h = (seed ^ Math.imul(index | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t); // easing mượt giữa 2 điểm mốc địa hình
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);

/** Đưa góc về khoảng [-π, π] — tránh cộng dồn vô hạn khi xe xoay nhiều vòng. */
function normalizeAngle(a) {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ---- Địa hình: 2 lớp nhiễu (đồi lớn + gợn nhỏ) + đoạn phẳng lúc xuất phát ----
const COARSE_SEG = 320, COARSE_AMP = 92;  // đồi lớn: chu kỳ 320, biên độ 92
const FINE_SEG = 60, FINE_AMP = 16;       // gợn nhỏ: chu kỳ 60, biên độ 16
const FLAT_END = 200, RAMP_LEN = 250;     // 200 đơn vị đầu phẳng, sau đó tăng dần độ dốc
const BASE_Y = 420;                        // toạ độ canvas ứng với độ cao 0

// ---- Vật lý xe ----
const WHEELBASE = 46;          // khoảng cách 2 bánh (đơn vị thế giới)
const GROUND_SNAP = 0.9;       // lệch góc dưới ~51° coi là còn bám đường
const GAS_TORQUE = 0.055;      // mô-men ga tạo ra mỗi tick (ngóc đầu lên)
const BRAKE_TORQUE = 0.045;    // mô-men phanh (cúi đầu xuống) — đủ để hãm đà ngóc lên,
                                // nhưng KHÔNG mạnh hơn nhiều lần ga (mạnh quá sẽ tự gây
                                // lật ngược hướng khi phanh gấp — đã kiểm chứng bằng test)
const GROUND_STIFFNESS = 0.1;  // độ "cứng" lò xo kéo thân xe về góc mặt đường khi còn bám
const GROUND_DAMPING = 0.4;    // giảm chấn khi còn bám đường (chống rung/quá đà)
const AIR_DAMPING = 0.98;      // giảm chấn nhẹ khi bánh đã rời mặt đường (đang xoay tự do)
const GAS_FORCE = 0.045;       // lực đẩy tới mỗi tick khi ga hết cỡ
const BRAKE_FORCE = 0.07;      // lực phanh/lùi mỗi tick khi phanh hết cỡ
const GRAVITY = 0.085;         // hệ số trọng lực kéo lùi khi lên dốc / đẩy tới khi xuống dốc
const AIR_DRAG_EXTRA = 0.03;   // mất lực kéo thêm khi bánh không bám đường (quay trơn)
const MAX_SPEED = 3.2;
const MAX_REVERSE = -1.4;
const FRICTION = 0.995;        // ma sát lăn nhân vào tốc độ mỗi tick
const CRASH_ANGLE = 1.7;       // ~97° — thân xe lật quá góc này = crash

export class HillClimbEnv {
  static config = {
    name: 'Hill Climb Racing',
    inputs: 8,
    outputs: 2, // liên tục 0..1 (không threshold): độ mạnh ga và độ mạnh phanh
    inputLabels: [
      'tốc độ', 'góc xe', 'vận tốc góc', 'dốc dưới xe',
      'dốc phía trước gần', 'dốc phía trước vừa', 'dốc phía trước xa', 'còn bám đường?',
    ],
    outputLabels: ['ga', 'phanh'],
    scoreLabel: 'Quãng đường (m)',
  };

  constructor() {
    this.reset(0);
  }

  reset(seed) {
    this.seed = seed >>> 0;
    this.x = 0;
    this.speed = 0;
    this.angle = 0;
    this.angularVel = 0;
    this.grounded = true;
    this.ticks = 0;
  }

  /** Quy đổi đơn vị thế giới -> "mét" cho số liệu dễ đọc trên UI. */
  getScore() {
    return Math.floor(this.x / 10);
  }

  /** Độ cao địa hình tại x (đơn vị thế giới, dương = cao hơn nền). */
  _elevation(x) {
    let amp = 1;
    if (x < FLAT_END) amp = 0;
    else if (x < FLAT_END + RAMP_LEN) amp = smooth((x - FLAT_END) / RAMP_LEN);

    const coarse = this._noiseLayer(x, COARSE_SEG, COARSE_AMP, 1000);
    const fine = this._noiseLayer(x, FINE_SEG, FINE_AMP, 5000);
    return (coarse + fine) * amp;
  }

  _noiseLayer(x, segLen, amp, salt) {
    const idx = Math.floor(x / segLen);
    const t = smooth(x / segLen - idx);
    const h0 = (hash01(this.seed + salt, idx) * 2 - 1) * amp;
    const h1 = (hash01(this.seed + salt, idx + 1) * 2 - 1) * amp;
    return h0 + (h1 - h0) * t;
  }

  /** Toạ độ Y trên canvas tại vị trí x (mặt đất). */
  _canvasYAt(x) {
    return BASE_Y - this._elevation(x);
  }

  /** Góc dốc cục bộ quanh x, đo trên bề rộng `width` — dùng cho cả mặt đất dưới xe lẫn dốc phía trước. */
  _slopeAt(x, width) {
    const yFront = this._canvasYAt(x + width / 2);
    const yBack = this._canvasYAt(x - width / 2);
    return Math.atan2(yFront - yBack, width);
  }

  /**
   * GIÁC QUAN — 8 số chuẩn hoá quanh 0.5 (0.5 = trung tính/bằng 0):
   *  [0] tốc độ hiện tại   [1] góc thân xe   [2] vận tốc góc
   *  [3] độ dốc ngay dưới xe
   *  [4..6] độ dốc phía trước ở 3 khoảng cách gần/vừa/xa — để AI "nhìn thấy" dốc sắp tới
   *  [7] còn bám đường hay đang lật (1/0)
   */
  getInputs() {
    const groundAngle = this._slopeAt(this.x, WHEELBASE);
    const norm = (v, scale) => clamp01(v / scale / 2 + 0.5);
    return [
      norm(this.speed, MAX_SPEED),
      norm(this.angle, CRASH_ANGLE),
      norm(this.angularVel, 0.15),
      norm(groundAngle, CRASH_ANGLE),
      norm(this._slopeAt(this.x + 80, 40), CRASH_ANGLE),
      norm(this._slopeAt(this.x + 160, 50), CRASH_ANGLE),
      norm(this._slopeAt(this.x + 280, 60), CRASH_ANGLE),
      this.grounded ? 1 : 0,
    ];
  }

  /**
   * Một tick vật lý. outputs[0]/outputs[1] dùng TRỰC TIẾP làm cường độ ga/phanh
   * liên tục 0..1 (không threshold) — điều khiển kiểu "đạp ga bao nhiêu %",
   * gần với cách chơi thật hơn là bật/tắt.
   */
  step(outputs) {
    const gas = clamp01(outputs[0]);
    const brake = clamp01(outputs[1]);

    const groundAngle = this._slopeAt(this.x, WHEELBASE);
    const diff = normalizeAngle(this.angle - groundAngle);
    this.grounded = Math.abs(diff) < GROUND_SNAP;

    // --- Xoay thân xe ---
    // Ga tạo mô-men ngóc đầu lên, phanh tạo mô-men cúi đầu xuống (dấu ngược nhau
    // là điều BẮT BUỘC cho cơ chế học; dấu tuyệt đối không quan trọng vì hệ tự
    // nhất quán — xem comment cuối file).
    let torque = gas * GAS_TORQUE - brake * BRAKE_TORQUE;
    if (this.grounded) {
      // "Lò xo" treo: còn bám đường thì thân xe bị kéo về đúng góc mặt đường.
      // Ga đủ mạnh có thể thắng lực kéo này -> lệch dần -> rời mốc bám -> lật.
      torque += -diff * GROUND_STIFFNESS - this.angularVel * GROUND_DAMPING;
    }
    this.angularVel += torque;
    this.angularVel *= AIR_DAMPING;
    this.angle = normalizeAngle(this.angle + this.angularVel);

    // --- Tiến/lùi ---
    let accel = gas * GAS_FORCE - brake * BRAKE_FORCE;
    accel -= Math.sin(groundAngle) * GRAVITY; // lên dốc bị kéo lùi, xuống dốc được đẩy tới
    if (!this.grounded) accel -= this.speed * AIR_DRAG_EXTRA; // bánh quay trơn, mất lực kéo
    this.speed = clamp(this.speed + accel, MAX_REVERSE, MAX_SPEED) * FRICTION;

    const dx = this.speed;
    this.x = Math.max(0, this.x + dx);
    this.ticks++;

    const crashed = Math.abs(this.angle) > CRASH_ANGLE;
    // Reward = quãng đường tiến được tick này (lùi không thưởng nhưng không phạt
    // âm) — dày mỗi tick, tổng dồn lại chính là "quãng đường đi được" trực quan.
    const reward = Math.max(0, dx);
    return { reward, done: crashed };
  }

  /**
   * Vẽ theo góc nhìn camera bám xe (xe luôn ở gần bên trái khung hình, địa
   * hình cuộn qua). Chỉ vẽ mode 'full' — nhiều xe ở nhiều vị trí x khác nhau
   * không thể chồng lên cùng 1 camera như đàn chim Flappy.
   */
  render(ctx, mode = 'full') {
    if (mode !== 'full') return;
    const W = 480, H = 600, CAM_OFFSET = 150;
    const worldToScreenX = (wx) => wx - this.x + CAM_OFFSET;

    // Bầu trời
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a2a47'); sky.addColorStop(1, '#3c5a7a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Địa hình: polygon theo từng điểm ảnh ngang
    ctx.beginPath();
    ctx.moveTo(0, H);
    const step = 6;
    for (let sx = 0; sx <= W; sx += step) {
      const wx = sx + this.x - CAM_OFFSET;
      ctx.lineTo(sx, this._canvasYAt(wx));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    const ground = ctx.createLinearGradient(0, BASE_Y - 100, 0, H);
    ground.addColorStop(0, '#6fae4a'); ground.addColorStop(0.15, '#8a5a2e'); ground.addColorStop(1, '#4a3218');
    ctx.fillStyle = ground; ctx.fill();

    // Xe: trục xoay đặt tại mặt đường ở vị trí x hiện tại (đơn giản hoá — xem comment class)
    const carScreenX = worldToScreenX(this.x);
    const carScreenY = this._canvasYAt(this.x) - 6;
    ctx.save();
    ctx.translate(carScreenX, carScreenY);
    ctx.rotate(this.angle);
    // Thân xe
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-WHEELBASE / 2 - 4, -16, WHEELBASE + 8, 16);
    ctx.fillStyle = '#f5b7b1';
    ctx.fillRect(-WHEELBASE / 4, -26, WHEELBASE / 2 + 6, 12); // buồng lái
    // Bánh xe
    ctx.fillStyle = '#1a1a1a';
    for (const wx of [-WHEELBASE / 2, WHEELBASE / 2]) {
      ctx.beginPath(); ctx.arc(wx, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(wx, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
    }
    ctx.restore();

    // HUD: quãng đường + cảnh báo sắp lật
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.getScore()} m`, 14, 32);
    if (Math.abs(this.angle) > CRASH_ANGLE * 0.65) {
      ctx.fillStyle = '#ff5252';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('⚠ sắp lật!', 14, 54);
    }
  }
}

/*
 * Ghi chú dấu vật lý: hệ atan2(canvasY_trước - canvasY_sau, khoảng cách) tự
 * nhất quán — groundAngle dùng để vẽ VÀ để tính lực/mô-men bằng CHÍNH công
 * thức đó, nên không cần biết "góc dương nghĩa là gì" theo trực giác, chỉ cần
 * 2 điều đã được kiểm chứng bằng test headless (xem test-hillclimb.mjs lúc
 * phát triển): (1) lên dốc thì accel bị giảm, xuống dốc thì accel tăng —
 * đúng vật lý; (2) ga liên tục không kiểm soát trên dốc sẽ khiến góc xe lệch
 * dần và cuối cùng lật — đúng cơ chế "wheelie" của game gốc.
 */
