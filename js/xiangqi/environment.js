/**
 * environment.js — Environment "Cờ Tướng" cho neuroevolution.
 *
 * Khác hẳn Flappy/Snake (mỗi step = 1 khung hình realtime), ở đây MỖI step() =
 * MỘT VÁN CỜ HOÀN CHỈNH. Cá thể (AI, cầm ĐỎ) đấu với bot.js (cầm ĐEN) ở một cấp.
 * AI tìm nước bằng minimax NHƯNG dùng MẠNG NƠ-RON của cá thể làm hàm đánh giá
 * (nnEvaluator) — nên genome = trọng số mạng đánh giá đó.
 *
 * THANG CẤP (ladder): mỗi cá thể bắt đầu đấu bot cấp thấp nhất. Thắng cấp X thì
 * step() kế tiếp (Trainer gọi lại vì done=false) đấu cấp X+1; thua/hoà thì dừng.
 * => Cá thể giỏi leo được nhiều cấp trong một thế hệ; getScore() = cấp cao nhất
 *    đã hạ, chính là con số cho biểu đồ "2 giai đoạn học".
 *
 * Interface chung (giống flappy.js) + 2 điểm mở rộng dùng chung, tuỳ chọn:
 *   attachNetwork(net) — Trainer đưa mạng của cá thể vào (xem ga.js).
 *   getScore()         — điểm trực quan cho UI.
 */

import { Xiangqi } from './lib/xiangqi.js';
import { createBot, MAX_LEVEL } from './bot.js';
import { searchBestMove } from './minimax.js';
import { makeNNEvaluate, extractFeatures, FEATURE_COUNT, FEATURE_LABELS } from './nnEvaluator.js';

const GLYPH = {
  r: { r: '俥', n: '傌', b: '相', a: '仕', k: '帥', c: '炮', p: '兵' },
  b: { r: '車', n: '馬', b: '象', a: '士', k: '將', c: '砲', p: '卒' },
};

export class XiangqiEnv {
  static config = {
    name: 'Cờ Tướng (NN eval)',
    inputs: FEATURE_COUNT,   // 14 đặc trưng thế cờ
    outputs: 1,              // 1 điểm đánh giá (không phải hành động)
    inputLabels: FEATURE_LABELS,
    outputLabels: ['đánh giá'],
    scoreLabel: 'Cấp bot đã thắng',
  };

  /**
   * @param {object} [opts]
   * @param {number} [opts.evalDepth=1] — độ sâu minimax khi AI dùng NN (1-2, để nhanh)
   * @param {number} [opts.startLevel=1] — cấp bot khởi điểm của thang
   * @param {number} [opts.moveLimit=100] — trần số nước/ván, tránh treo ván bất phân
   */
  constructor(opts = {}) {
    this.evalDepth = opts.evalDepth ?? 1;
    this.startLevel = opts.startLevel ?? 1;
    this.moveLimit = opts.moveLimit ?? 100;
    this.net = null;
    this.evaluate = null;
    this.reset(0);
  }

  /** Trainer gọi để gắn mạng nơ-ron của cá thể — mạng này thành hàm đánh giá. */
  attachNetwork(net) {
    this.net = net;
    this.evaluate = makeNNEvaluate(net);
  }

  /** Bắt đầu "vòng đời" cá thể: về cấp khởi điểm, chưa thắng cấp nào. */
  reset(_seed) {
    this.currentLevel = this.startLevel;
    this.bestLevelBeaten = 0;
    this.viewGame = new Xiangqi();  // thế cờ để hiển thị (ban đầu là khai cuộc)
    this.lastResult = null;         // 'win' | 'loss' | 'draw'
    this.lastMoves = 0;
  }

  /** Điểm trực quan: cấp bot cao nhất đã hạ (0 nếu chưa thắng ai). */
  getScore() {
    return this.bestLevelBeaten;
  }

  /** Đặc trưng thế cờ đang hiển thị — để Trainer chạy net.forward (và vẽ "bộ não"). */
  getInputs() {
    return extractFeatures(this.viewGame);
  }

  /**
   * Chơi TRỌN một ván AI (Đỏ) vs bot cấp hiện tại (Đen), rồi tính reward.
   * @param {number[]} _outputs — BỎ QUA: mạng được dùng bên trong minimax, không
   *   phải để chọn hành động trực tiếp như các game realtime.
   * @returns {{reward:number, done:boolean}}
   */
  step(_outputs) {
    const g = new Xiangqi();
    const bot = createBot(this.currentLevel);
    let moves = 0;

    // Vòng lặp một ván: Đỏ (AI) đi trước, luân phiên tới khi kết thúc hoặc quá dài.
    while (!g.game_over() && moves < this.moveLimit) {
      const m = g.turn() === 'r'
        ? searchBestMove(g, this.evalDepth, this.evaluate) // AI dùng minimax + NN
        : bot.chooseMove(g);                               // đối thủ dùng heuristic
      if (!m) break;
      g.move(m);
      moves++;
    }

    this.viewGame = g;
    this.lastMoves = moves;

    // --- Xác định kết quả (AI = Đỏ) ---
    let outcome;
    if (moves >= this.moveLimit) {
      outcome = 'draw';                                     // quá dài, bất phân => hoà
    } else if (g.in_checkmate() || g.in_stalemate()) {
      // Hết nước cho bên đang tới lượt => bên đó THUA. AI là Đỏ.
      outcome = g.turn() === 'r' ? 'loss' : 'win';
    } else {
      outcome = 'draw';                                     // in_draw() hoặc hết cờ khác
    }
    this.lastResult = outcome;

    // ═══════════════════ CÔNG THỨC FITNESS ═══════════════════
    // Ba thành phần cộng lại (Trainer sẽ cộng dồn reward qua các ván leo thang):
    //   (a) ĐIỂM NỀN theo kết quả: thắng >> hoà > thua.
    //   (b) THƯỞNG THEO CẤP đối thủ vừa thắng: hạ bot cấp cao đáng giá hơn nhiều
    //       (LEVEL_BONUS lớn để "leo thang" luôn là mục tiêu áp đảo).
    //   (c) TRỪ DẦN theo số nước khi thắng: khuyến khích thắng NHANH, dứt điểm.
    // Khi THUA, thưởng nhẹ theo số nước sống được — để thế hệ đầu (toàn thua) vẫn
    // có gradient "sống lâu hơn = tốt hơn", chính là GIAI ĐOẠN 1 (học không chết
    // nhanh) trước khi có GIAI ĐOẠN 2 (học thắng, kéo cột "cấp đã thắng" đi lên).
    const WIN_BASE = 500;
    const LEVEL_BONUS = 500;
    const DRAW_BASE = 150;
    const MOVE_COST = 2;

    let reward;
    let done;
    if (outcome === 'win') {
      reward = WIN_BASE + LEVEL_BONUS * this.currentLevel - MOVE_COST * moves;
      this.bestLevelBeaten = this.currentLevel;
      this.currentLevel++;                 // THĂNG CẤP cho ván sau
      done = this.currentLevel > MAX_LEVEL; // hạ hết thang thì kết thúc cá thể
    } else if (outcome === 'draw') {
      reward = DRAW_BASE - moves;          // hoà: hơn thua chút, nhưng hoà lê thê thì kém
      done = true;                         // không thăng cấp => dừng cá thể tại đây
    } else { // loss
      reward = moves;                      // thua: thưởng nhẹ theo số nước cầm cự được
      done = true;
    }

    return { reward: Math.max(0, reward), done };
  }

  /**
   * Vẽ ván đang/ vừa chơi lên canvas chính (480x600).
   * mode 'full' = con giỏi nhất (vẽ đầy đủ). mode 'agent' bỏ qua — chồng nhiều
   * bàn cờ lên nhau không có ý nghĩa như đàn chim Flappy.
   */
  render(ctx, mode = 'full') {
    if (mode !== 'full') return;

    const COLS = 9, ROWS = 10, CELL = 46;
    const bw = (COLS - 1) * CELL, bh = (ROWS - 1) * CELL;
    const ox = (480 - bw) / 2, oy = 34; // canh giữa ngang, chừa lề trên
    const px = (c) => ox + c * CELL;
    const py = (r) => oy + r * CELL;

    // Nền gỗ
    ctx.fillStyle = '#e9c489';
    ctx.fillRect(ox - 18, oy - 18, bw + 36, bh + 36);
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.2;
    for (let r = 0; r < ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(px(0), py(r)); ctx.lineTo(px(COLS - 1), py(r)); ctx.stroke();
    }
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === COLS - 1) {
        ctx.beginPath(); ctx.moveTo(px(c), py(0)); ctx.lineTo(px(c), py(ROWS - 1)); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(px(c), py(0)); ctx.lineTo(px(c), py(4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(c), py(5)); ctx.lineTo(px(c), py(ROWS - 1)); ctx.stroke();
      }
    }
    const palace = (r0, r1) => {
      ctx.beginPath(); ctx.moveTo(px(3), py(r0)); ctx.lineTo(px(5), py(r1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(5), py(r0)); ctx.lineTo(px(3), py(r1)); ctx.stroke();
    };
    palace(0, 2); palace(7, 9);

    // Quân cờ
    const b = this.viewGame.board();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = b[r][c];
        if (!cell) continue;
        const x = px(c), y = py(r);
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#f3ddb3'; ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = cell.color === 'r' ? '#c0392b' : '#1a1a1a';
        ctx.stroke();
        ctx.fillStyle = cell.color === 'r' ? '#c0392b' : '#1a1a1a';
        ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(GLYPH[cell.color][cell.type], x, y + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Thanh trạng thái dưới cùng: đang đấu cấp mấy + kết quả ván vừa rồi
    const resText = this.lastResult === 'win' ? '✓ THẮNG'
      : this.lastResult === 'loss' ? '✗ thua'
      : this.lastResult === 'draw' ? '½ hoà' : '…';
    ctx.fillStyle = '#dce3f0';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `AI (Đỏ) vs Bot cấp ${this.currentLevel}  ·  ván trước: ${resText} (${this.lastMoves} nước)  ·  đã hạ tới cấp ${this.bestLevelBeaten}`,
      240, oy + bh + 32
    );
  }
}
