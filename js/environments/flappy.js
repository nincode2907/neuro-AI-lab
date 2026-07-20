/**
 * flappy.js — Environment Flappy Bird.
 *
 * Mỗi cá thể trong quần thể sở hữu MỘT instance FlappyEnv riêng, nhưng tất cả
 * được reset với CÙNG seed => dàn ống giống hệt nhau, chỉ khác con chim.
 * Nhờ vậy khi vẽ, ta chồng nhiều con chim lên cùng một màn chơi.
 *
 * ═══ INTERFACE CHUNG mọi environment phải implement (xem registry.js) ═══
 *   static config = { name, inputs, outputs }
 *   reset(seed)          — về trạng thái đầu, seed để sinh map tái lập được
 *   getInputs()          — mảng số đã CHUẨN HOÁ 0..1 (giác quan của AI)
 *   step(outputs)        — nhận mảng output thô của mạng nơ-ron, tự diễn giải
 *                          thành hành động, cập nhật 1 tick, trả { reward, done }
 *   render(ctx, mode)    — 'full': vẽ cả màn chơi + agent (con đại diện)
 *                          'agent': chỉ vẽ agent (chồng lên màn đã vẽ)
 * ════════════════════════════════════════════════════════════════════════
 */

/** PRNG có seed (mulberry32) — để mọi cá thể cùng thế hệ gặp dàn ống y hệt nhau. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Hằng số vật lý & kích thước (toạ độ logic = kích thước canvas 480x600) ----
const W = 480;
const H = 600;
const BIRD_X = 100;        // chim đứng yên theo trục x, ống trôi về phía nó
const BIRD_R = 12;         // bán kính chim
const GRAVITY = 0.45;      // gia tốc rơi mỗi tick
const FLAP_VY = -7.5;      // vận tốc nhận được khi vỗ cánh
const MAX_VY = 12;         // kẹp vận tốc để chuẩn hoá input
const PIPE_W = 70;         // bề rộng ống
const PIPE_GAP = 150;      // khe hở giữa ống trên và ống dưới
// khoảng cách ngang giữa 2 ống liên tiếp — 280 là mốc ĐÃ KIỂM CHỨNG BẰNG MÔ
// PHỎNG VẬT LÝ (không phải áng chừng): với gapY random độc lập trong [80,520],
// trường hợp xấu nhất "khe sát đáy -> khe sát đỉnh liền kề" đòi hỏi chim leo
// 290px hiệu dụng; theo công thức flap/gravity hiện tại, chiến lược leo tối
// ưu (flap dồn dập rồi thả trôi) cần tối thiểu ~42 tick, trong khi spacing=200
// chỉ cho ~35 tick trống -> THIẾU ~7 tick, tức ~2.76% cặp ống ngẫu nhiên hoàn
// toàn KHÔNG THỂ vượt qua dù bay hoàn hảo tuyệt đối (frame-perfect). Ngưỡng
// khả thi lý thuyết tối thiểu là ~230px (không có dư cho sai số điều khiển);
// 280 cho dư ~60px/~20 tick để một mạng nơ-ron KHÔNG hoàn hảo vẫn học được
// (0.00%-0.14% cặp ống bất khả thi trong 200.000 mẫu Monte Carlo — coi như 0).
const PIPE_SPACING = 240;
const PIPE_SPEED = 3;      // tốc độ ống trôi sang trái mỗi tick

export class FlappyEnv {
  /**
   * Config MẶC ĐỊNH (lookahead = 1 => 4 input). Khi người dùng chọn nhìn
   * trước nhiều ống hơn, Trainer/UI lấy config động qua `configFor(opts)` —
   * KHÔNG dùng trực tiếp static này. Static vẫn để đây cho tương thích ngược
   * (registry.config) và làm mốc mặc định.
   */
  static config = {
    name: 'Flappy Bird',
    inputs: 4,   // [độ cao chim, vận tốc rơi, k/c ngang tới ống, lệch khe hở]
    outputs: 1,  // 1 giá trị 0..1: > 0.5 nghĩa là "vỗ cánh"
    // Metadata cho UI (nhãn vẽ mạng nơ-ron + tên score) — tuỳ chọn nhưng nên có
    inputLabels: ['độ cao', 'vận tốc', 'k/c ống', 'lệch khe'],
    outputLabels: ['nhảy'],
    scoreLabel: 'Ống vượt qua',
    // Khai báo cho UI biết 2 input nào để quét "policy heatmap" (xem heatmap.js
    // + ui.js: drawHeatmap). Chỉ số 2,3 luôn là k/c ống + lệch khe CỦA ỐNG GẦN
    // NHẤT — cố định bất kể lookahead (xem configFor: lookahead chỉ thêm input
    // ở CUỐI mảng, không đổi vị trí 2 input đầu này). Game nào không khai báo
    // trường này thì UI hiểu là "không áp dụng được" (chỉ hợp với quyết định
    // nhị phân outputs[0]>0.5, không hợp với game nhiều hành động/không phải
    // quyết định trực tiếp như Cờ Tướng).
    heatmapAxes: {
      xIndex: 2, yIndex: 3,
      xLabel: 'khoảng cách tới ống', yLabel: 'độ lệch so với tâm khe',
      // Nhãn 2 đầu mỗi trục — để UI (generic, không biết ngữ nghĩa Flappy) vẫn
      // hiện được "0 nghĩa là gì, 1 nghĩa là gì" thay vì chỉ số trần trụi.
      xLow: 'gần', xHigh: 'xa',
      yLow: 'chim ở trên khe', yHigh: 'chim ở dưới khe (nên nhảy)',
    },
  };

  /** Kẹp lookahead về 1..3 (có tối đa ~3 ống trước mặt chim mỗi lúc). */
  static _normLookahead(v) {
    return Math.max(1, Math.min(3, Math.round(Number(v) || 1)));
  }

  /**
   * Config ĐỘNG theo option `lookahead` (số ống AI nhìn trước). Mỗi ống nhìn
   * thêm góp 2 input (k/c ngang + tâm khe hở của ống đó), nên số input =
   * 2 (độ cao + vận tốc) + 2 × lookahead. Trainer dùng số này để dựng mạng,
   * UI dùng inputLabels để vẽ nhãn node — xem registry.js (configFor).
   */
  static configFor(opts = {}) {
    const lookahead = FlappyEnv._normLookahead(opts.lookahead);
    const labels = ['độ cao', 'vận tốc'];
    for (let i = 1; i <= lookahead; i++) {
      const suffix = lookahead > 1 ? ` ${i}` : '';
      labels.push(`k/c ống${suffix}`, `lệch khe${suffix}`);
    }
    return {
      ...FlappyEnv.config,
      inputs: 2 + 2 * lookahead,
      inputLabels: labels,
    };
  }

  constructor(opts = {}) {
    // Số ống nhìn trước — quyết định số input của mạng (phải khớp configFor).
    this.lookahead = FlappyEnv._normLookahead(opts.lookahead);
    this.reset(0);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.birdY = H / 2;
    this.birdVy = 0;
    this.pipesPassed = 0;
    this.ticks = 0;

    // Sinh sẵn vài ống đầu; ống mới được đắp thêm khi ống cũ trôi ra ngoài
    this.pipes = [];
    let x = W + 100; // ống đầu tiên cách xa một chút cho chim kịp "định thần"
    for (let i = 0; i < 4; i++) {
      this.pipes.push(this._makePipe(x));
      x += PIPE_SPACING;
    }
  }

  /** Sinh một ống tại vị trí x, tâm khe hở ngẫu nhiên (theo seeded RNG). */
  _makePipe(x) {
    const margin = 80; // khe hở không sát mép trên/dưới
    const gapY = margin + this.rng() * (H - 2 * margin); // tâm khe hở
    return { x, gapY, passed: false };
  }

  /** Score game — con số trực quan cho người xem (khác fitness của GA). */
  getScore() {
    return this.pipesPassed;
  }

  /**
   * `n` ống gần nhất còn phía trước mặt chim, xếp gần → xa. Với lookahead > 1,
   * AI "nhìn" được nhiều ống liên tiếp để canh trước trajectory (xem getInputs).
   */
  _nextPipes(n) {
    return this.pipes
      .filter((p) => p.x + PIPE_W >= BIRD_X - BIRD_R)
      .sort((a, b) => a.x - b.x)
      .slice(0, n);
  }

  /**
   * GIÁC QUAN của AI — tất cả chuẩn hoá về 0..1. Luôn có 2 input đầu (độ cao,
   * vận tốc); mỗi ống nhìn trước (lookahead) góp thêm 2 input (k/c ngang, lệch
   * khe hở). Chuẩn hoá quan trọng: giữ input cùng thang đo giúp mạng nơ-ron
   * nhỏ học được mà không cần lớp chuẩn hoá riêng.
   *
   * "Lệch khe" = (birdY − gapY) đã chuẩn hoá, KHÔNG phải gapY thô. Đưa thẳng
   * phép trừ vào input thay vì bắt mạng tự học nó qua lớp ẩn — tín hiệu
   * "đang ở trên hay dưới khe" gần như có sẵn trong 1 con số:
   *   = 0.5  chim ngang đúng tâm khe
   *   < 0.5  chim đang Ở TRÊN khe (cần rơi thêm / đừng nhảy)
   *   > 0.5  chim đang Ở DƯỚI khe (cần nhảy)
   * Vẫn giữ `birdY/H` (độ cao tuyệt đối) làm lưới an toàn cho lúc không có
   * ống nào gần (chạm trần/đất không phụ thuộc ống).
   */
  getInputs() {
    const pipes = this._nextPipes(this.lookahead);
    const inputs = [
      this.birdY / H,                          // độ cao chim (tuyệt đối)
      (this.birdVy + MAX_VY) / (2 * MAX_VY),   // vận tốc rơi (-MAX..MAX -> 0..1)
    ];
    for (let i = 0; i < this.lookahead; i++) {
      const pipe = pipes[i];
      // Thiếu ống (chưa sinh kịp) => coi như "xa & lệch khe = 0" cho khỏi nhiễu.
      inputs.push(pipe ? (pipe.x - BIRD_X) / W : 1);                        // k/c ngang tới ống thứ i+1
      inputs.push(pipe ? 0.5 + (this.birdY - pipe.gapY) / H : 0.5);         // lệch khe của ống đó
    }
    return inputs;
  }

  /**
   * Một tick vật lý. outputs là mảng thô từ mạng nơ-ron;
   * env tự diễn giải: outputs[0] > 0.5 => vỗ cánh.
   */
  step(outputs) {
    this.ticks++;

    // --- Hành động ---
    if (outputs[0] > 0.5) this.birdVy = FLAP_VY;

    // --- Vật lý chim ---
    this.birdVy = Math.min(this.birdVy + GRAVITY, MAX_VY);
    this.birdY += this.birdVy;

    // --- Ống trôi + tái sinh ---
    let maxX = 0;
    for (const p of this.pipes) {
      p.x -= PIPE_SPEED;
      maxX = Math.max(maxX, p.x);
    }
    if (this.pipes[0].x + PIPE_W < 0) {
      this.pipes.shift();
      this.pipes.push(this._makePipe(maxX + PIPE_SPACING));
    }

    // --- Reward & va chạm ---
    // +1 mỗi tick sống sót (thời gian sống), +100 mỗi ống vượt qua.
    // Thưởng ống lớn hơn hẳn để "vượt ống" trở thành mục tiêu chính,
    // còn thưởng sống sót giúp phân biệt các con chết sớm ở thế hệ đầu.
    let reward = 1;
    let done = false;

    // Chạm trần / chạm đất => chết
    if (this.birdY - BIRD_R < 0 || this.birdY + BIRD_R > H) done = true;

    for (const p of this.pipes) {
      // Chim nằm trong dải x của ống?
      if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
        // Ngoài khe hở => va chạm
        if (this.birdY - BIRD_R < p.gapY - PIPE_GAP / 2 ||
            this.birdY + BIRD_R > p.gapY + PIPE_GAP / 2) {
          done = true;
        }
      }
      // Vừa vượt qua mép phải của ống lần đầu => +100
      if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.passed = true;
        this.pipesPassed++;
        reward += 100;
      }
    }

    return { reward, done };
  }

  /**
   * Vẽ lên canvas.
   * mode 'full'  : nền + ống + chim (con đại diện cho cả màn chơi)
   * mode 'agent' : CHỈ con chim, mờ hơn (chồng lên màn 'full' đã vẽ)
   */
  render(ctx, mode = 'full') {
    if (mode === 'full') {
      // Nền trời
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0e2a47');
      sky.addColorStop(1, '#123c5e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Ống
      for (const p of this.pipes) {
        const top = p.gapY - PIPE_GAP / 2;
        const bot = p.gapY + PIPE_GAP / 2;
        ctx.fillStyle = '#2e9e5b';
        ctx.fillRect(p.x, 0, PIPE_W, top);          // ống trên
        ctx.fillRect(p.x, bot, PIPE_W, H - bot);    // ống dưới
        ctx.fillStyle = '#37bd6d';                  // "miệng" ống
        ctx.fillRect(p.x - 4, top - 14, PIPE_W + 8, 14);
        ctx.fillRect(p.x - 4, bot, PIPE_W + 8, 14);
      }

      // Số ống đã vượt (của con đại diện)
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(this.pipesPassed), W / 2, 48);
    }

    // Con chim (mode 'agent' vẽ mờ để thấy "bầy" đang thử nghiệm)
    ctx.save();
    ctx.globalAlpha = mode === 'full' ? 1 : 0.35;
    ctx.beginPath();
    ctx.arc(BIRD_X, this.birdY, BIRD_R, 0, Math.PI * 2);
    ctx.fillStyle = mode === 'full' ? '#ffd54f' : '#ffb74d';
    ctx.fill();
    if (mode === 'full') {
      // Mắt + mỏ cho con đại diện
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(BIRD_X + 4, this.birdY - 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8a65';
      ctx.fillRect(BIRD_X + BIRD_R - 2, this.birdY - 2, 8, 5);
    }
    ctx.restore();
  }
}
