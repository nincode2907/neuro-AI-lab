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
const PIPE_SPACING = 300;  // khoảng cách ngang giữa 2 ống liên tiếp
const PIPE_SPEED = 3;      // tốc độ ống trôi sang trái mỗi tick

export class FlappyEnv {
  /** Thông tin Trainer + UI cần biết — KHÔNG hardcode ở nơi khác. */
  static config = {
    name: 'Flappy Bird',
    inputs: 4,   // [độ cao chim, vận tốc rơi, k/c ngang tới ống, tâm khe hở]
    outputs: 1,  // 1 giá trị 0..1: > 0.5 nghĩa là "vỗ cánh"
    // Metadata cho UI (nhãn vẽ mạng nơ-ron + tên score) — tuỳ chọn nhưng nên có
    inputLabels: ['độ cao', 'vận tốc', 'k/c ống', 'khe hở'],
    outputLabels: ['nhảy'],
    scoreLabel: 'Ống vượt qua',
  };

  constructor() {
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

  /** Ống gần nhất phía trước mặt chim — thứ duy nhất AI cần "nhìn". */
  _nextPipe() {
    let next = null;
    for (const p of this.pipes) {
      if (p.x + PIPE_W >= BIRD_X - BIRD_R && (!next || p.x < next.x)) next = p;
    }
    return next;
  }

  /**
   * GIÁC QUAN của AI — 4 con số, tất cả chuẩn hoá về 0..1.
   * Chuẩn hoá quan trọng: giữ input cùng thang đo giúp mạng nơ-ron nhỏ
   * học được mà không cần lớp chuẩn hoá riêng.
   */
  getInputs() {
    const pipe = this._nextPipe();
    return [
      this.birdY / H,                                   // 1. độ cao chim
      (this.birdVy + MAX_VY) / (2 * MAX_VY),            // 2. vận tốc rơi (-MAX..MAX -> 0..1)
      pipe ? (pipe.x - BIRD_X) / W : 1,                 // 3. k/c ngang tới ống tiếp theo
      pipe ? pipe.gapY / H : 0.5,                       // 4. vị trí tâm khe hở của ống đó
    ];
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
