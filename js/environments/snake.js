/**
 * snake.js — Environment Snake: AI phải CHỦ ĐỘNG tìm mồi, không chỉ né.
 *
 * Điểm thú vị để quan sát — HAI GIAI ĐOẠN HỌC rõ rệt:
 *   Giai đoạn 1: fitness tăng nhưng score (mồi ăn) vẫn ≈ 0
 *                → AI mới chỉ học "đừng đâm vào tường / thân mình" (+1 mỗi tick).
 *   Giai đoạn 2: score bắt đầu tăng → AI học "đi về phía mồi".
 *                Cơ chế ĐÓI ép nó phải làm vậy: đi lòng vòng quá HUNGER_MAX
 *                bước mà không ăn là chết đói — sống sót đơn thuần không đủ nữa.
 * Xem biểu đồ "Score theo thế hệ": nó nằm ngang một hồi rồi mới bật lên,
 * trong khi fitness đã tăng từ trước — đó chính là ranh giới 2 giai đoạn.
 *
 * Interface chung: xem mô tả ở đầu flappy.js.
 */

/** PRNG có seed (mulberry32) — mọi cá thể cùng thế hệ gặp cùng chuỗi vị trí mồi. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Lưới & luật chơi (canvas 480x600 => lưới 16x20, ô 30px) ----
const COLS = 16;
const ROWS = 20;
const CELL = 30;
const HUNGER_MAX = 120;   // đi quá 120 bước không ăn => chết đói (chống đi lòng vòng)
const FOOD_REWARD = 150;  // thưởng lớn khi ăn mồi — mục tiêu chính của giai đoạn 2

// 4 hướng theo chiều kim đồng hồ: 0=lên, 1=phải, 2=xuống, 3=trái
const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export class SnakeEnv {
  static config = {
    name: 'Snake',
    inputs: 6,   // 3 cảm biến nguy hiểm + 2 vị trí mồi (hệ quy chiếu tương đối) + 1 độ đói
    outputs: 3,  // rẽ trái / đi thẳng / rẽ phải (chọn output lớn nhất — argmax)
    inputLabels: ['nguy: trước', 'nguy: trái', 'nguy: phải',
                  'mồi: trước/sau', 'mồi: phải/trái', 'độ đói'],
    outputLabels: ['rẽ trái', 'đi thẳng', 'rẽ phải'],
    scoreLabel: 'Mồi đã ăn',
  };

  constructor() {
    this.reset(0);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    // Rắn dài 3 đốt, nằm ngang giữa lưới, đang bò sang phải. snake[0] = đầu.
    const cx = (COLS / 2) | 0;
    const cy = (ROWS / 2) | 0;
    this.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    this.dir = 1; // sang phải
    this.foodEaten = 0;
    this.hunger = 0;
    this.ticks = 0;
    this._placeFood();
  }

  getScore() {
    return this.foodEaten;
  }

  /** Đặt mồi vào ô trống ngẫu nhiên (theo seeded RNG). */
  _placeFood() {
    let x, y, tries = 0;
    do {
      x = (this.rng() * COLS) | 0;
      y = (this.rng() * ROWS) | 0;
      tries++;
    } while (tries < 500 && this.snake.some((s) => s.x === x && s.y === y));
    this.food = { x, y };
  }

  /** Ô (x,y) có chết người không: tường hoặc thân rắn. */
  _blocked(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return this.snake.some((s) => s.x === x && s.y === y);
  }

  /**
   * GIÁC QUAN — 6 số chuẩn hoá 0..1, TẤT CẢ trong HỆ QUY CHIẾU CỦA CON RẮN
   * (xoay theo hướng đang bò). Đây là quyết định thiết kế quan trọng:
   * nếu đưa toạ độ mồi tuyệt đối + hướng one-hot, mạng phải TỰ HỌC phép xoay
   * hệ trục — quá khó, GA sẽ kẹt ở "đi vòng tròn". Đưa sẵn "mồi ở phía
   * trước hay sau, bên phải hay trái" thì hành vi đúng chỉ là hàm rất đơn giản:
   * "mồi bên phải -> rẽ phải" — GA tìm ra nhanh.
   *  [0..2] nguy hiểm ở ô kế tiếp: thẳng / trái / phải (0 hoặc 1)
   *  [3]    mồi ở phía trước (>0.5) hay phía sau (<0.5)
   *  [4]    mồi ở bên phải (>0.5) hay bên trái (<0.5)
   *  [5]    độ đói — cho AI "cảm nhận" sắp chết đói để biết khẩn trương
   */
  getInputs() {
    const head = this.snake[0];
    const d = this.dir;
    const leftDir = (d + 3) % 4;
    const rightDir = (d + 1) % 4;
    const danger = (dd) =>
      this._blocked(head.x + DIRS[dd].x, head.y + DIRS[dd].y) ? 1 : 0;

    // Xoay vector (đầu rắn -> mồi) vào hệ quy chiếu của rắn:
    // fwd = hình chiếu lên hướng đang bò, side = hình chiếu lên hướng bên phải
    const dx = this.food.x - head.x;
    const dy = this.food.y - head.y;
    const fwd = dx * DIRS[d].x + dy * DIRS[d].y;
    const side = dx * DIRS[rightDir].x + dy * DIRS[rightDir].y;
    const maxDist = Math.max(COLS, ROWS);

    return [
      danger(d), danger(leftDir), danger(rightDir),
      fwd / (2 * maxDist) + 0.5,
      side / (2 * maxDist) + 0.5,
      this.hunger / HUNGER_MAX,
    ];
  }

  /**
   * Một tick. outputs có 3 giá trị — chọn lớn nhất (argmax):
   * 0 = rẽ trái, 1 = đi thẳng, 2 = rẽ phải (tương đối theo hướng đang bò).
   */
  step(outputs) {
    this.ticks++;

    // --- Hành động: argmax 3 outputs -> đổi hướng tương đối ---
    let act = 0;
    for (let i = 1; i < outputs.length; i++) {
      if (outputs[i] > outputs[act]) act = i;
    }
    this.dir = (this.dir + [3, 0, 1][act]) % 4; // trái = -1 (mod 4 = +3)

    // --- Bò tới 1 ô ---
    const head = this.snake[0];
    const nx = head.x + DIRS[this.dir].x;
    const ny = head.y + DIRS[this.dir].y;

    // Đâm tường / thân => chết ngay, không có reward tick này
    if (this._blocked(nx, ny)) return { reward: 0, done: true };

    // Khoảng cách Manhattan tới mồi trước/sau bước đi — dùng cho reward shaping
    const distBefore = Math.abs(this.food.x - head.x) + Math.abs(this.food.y - head.y);
    const distAfter = Math.abs(this.food.x - nx) + Math.abs(this.food.y - ny);

    this.snake.unshift({ x: nx, y: ny }); // thêm đầu mới

    // --- Ăn mồi? ---
    if (nx === this.food.x && ny === this.food.y) {
      // KHÔNG cắt đuôi => rắn dài ra. Reset độ đói, thưởng lớn.
      this.foodEaten++;
      this.hunger = 0;
      this._placeFood();
      return { reward: FOOD_REWARD + 1, done: false };
    }

    // Không ăn: cắt đuôi (giữ nguyên độ dài), tăng độ đói
    this.snake.pop();
    if (++this.hunger >= HUNGER_MAX) {
      // Chết đói — cơ chế ép AI chuyển từ "sống sót" sang "săn mồi"
      return { reward: 0, done: true };
    }

    // REWARD SHAPING: +1 sống sót (động lực giai đoạn 1)
    // + thưởng/phạt nhẹ theo hướng so với mồi (tín hiệu dẫn đường giai đoạn 2).
    // Không có shaping, GA gần như không thể "tình cờ" tìm ra hành vi săn mồi —
    // xác suất một chuỗi gen ngẫu nhiên dẫn thẳng tới mồi quá thấp.
    // Shaping nhỏ hơn nhiều so với FOOD_REWARD nên ăn mồi vẫn là mục tiêu chính.
    const reward = 1 + (distAfter < distBefore ? 1 : -0.5);
    return { reward, done: false };
  }

  /**
   * mode 'full'  : lưới + mồi + toàn thân con rắn đại diện + score
   * mode 'agent' : chỉ chấm đầu rắn mờ (vẽ chồng cả bầy sẽ rối nếu vẽ nguyên thân)
   */
  render(ctx, mode = 'full') {
    if (mode === 'full') {
      // Nền + lưới mờ
      ctx.fillStyle = '#0d1a12';
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let i = 1; i < COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, ROWS * CELL); ctx.stroke();
      }
      for (let j = 1; j < ROWS; j++) {
        ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(COLS * CELL, j * CELL); ctx.stroke();
      }

      // Mồi
      ctx.fillStyle = '#ef5350';
      ctx.beginPath();
      ctx.arc(this.food.x * CELL + CELL / 2, this.food.y * CELL + CELL / 2, CELL * 0.32, 0, Math.PI * 2);
      ctx.fill();

      // Thân rắn: đầu sáng, càng về đuôi càng tối
      for (let i = this.snake.length - 1; i >= 0; i--) {
        const s = this.snake[i];
        const t = i / Math.max(1, this.snake.length - 1); // 0 = đầu, 1 = đuôi
        ctx.fillStyle = i === 0 ? '#aee571' : `rgba(102, 187, 106, ${1 - t * 0.6})`;
        ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
      }

      // Score + thanh độ đói (đầy dần = sắp chết đói)
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🍎 ' + this.foodEaten, 12, 32);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(12, 42, 100, 6);
      ctx.fillStyle = this.hunger > HUNGER_MAX * 0.7 ? '#ef5350' : '#ffb74d';
      ctx.fillRect(12, 42, (this.hunger / HUNGER_MAX) * 100, 6);
    } else {
      // Cả bầy: chỉ chấm đầu, mờ
      const head = this.snake[0];
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ffb74d';
      ctx.fillRect(head.x * CELL + 6, head.y * CELL + 6, CELL - 12, CELL - 12);
      ctx.restore();
    }
  }
}
