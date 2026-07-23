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

// Số tick "chờ" giữa 2 nửa nước (1 ply). GIỐNG 2048 (TICKS_PER_MOVE): trước đây
// step() chơi TRỌN một ván trong 1 tick — nặng (mỗi cá thể chạy hàng chục lần
// minimax/tick) nên vừa lag vừa "loé qua" không xem được. Giờ mỗi tick chỉ đi
// MỘT nửa nước; kéo slider tốc độ để tua nhanh. Giá trị lớn hơn = xem chậm/rõ
// hơn VÀ giãn các frame nặng ra (mỗi cá thể chỉ chạy minimax vào đúng tick đi
// nước), nên vừa dễ xem vừa đỡ giật — xem docs/xiangqi.md.
const TICKS_PER_MOVE = 18;

export class XiangqiEnv {
  static config = {
    name: 'Cờ Tướng (NN eval)',
    inputs: FEATURE_COUNT,   // xem nnEvaluator.js: FEATURE_COUNT + FEATURE_LABELS
    outputs: 1,              // 1 điểm đánh giá (không phải hành động)
    inputLabels: FEATURE_LABELS,
    outputLabels: ['đánh giá'],
    scoreLabel: 'Cấp bot đã thắng',
    // scoreLabel là DANH TỪ ("Cấp bot đã thắng"), ghép thẳng vào câu kiểu "đạt X
    // {scoreLabel}" (mẫu chung ui.js dùng cho mọi game) đọc lên rất gượng ép ở
    // đây ("lần đầu đạt 1 Cấp bot đã thắng"). Cung cấp câu riêng, tự nhiên hơn
    // ("lần đầu thắng được bot cấp 1") — ui.js: updateMilestones() ưu tiên dùng
    // nếu game có khai báo, game nào không có thì tự rơi về mẫu chung.
    milestoneText: (score, count) => (count
      ? `${count} cá thể cùng thắng được bot cấp ${score}`
      : `lần đầu thắng được bot cấp ${score}`),
  };

  /**
   * @param {object} [opts]
   * @param {number} [opts.evalDepth=1] — độ sâu minimax khi AI dùng NN (1-7; UI
   *   clamp cùng khoảng — xem ui.js: readSettings). Sâu hơn = nhìn xa hơn nhưng
   *   MỖI nước tốn ~10 lần thời gian hơn 1 tầng trước đó (nhánh rẽ ~10-40 nước
   *   hợp lệ/thế cờ) — 4 tầng đã bằng đúng bot cấp 7 (LEVELS trong bot.js).
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
    this.lastResult = null;         // 'win' | 'loss' | 'draw' của ván VỪA XONG
    this.lastMoves = 0;
    this._startGame();
  }

  /**
   * Mở một ván mới với bot ở `currentLevel`. Ván này được chơi DẦN qua nhiều
   * tick (mỗi tick 1 nửa nước — xem step), khác hẳn cách cũ chơi trọn trong 1
   * tick. Cooldown khởi điểm được LÀM LỆCH ngẫu nhiên giữa các cá thể để tick
   * "đi nước" (lúc chạy minimax) của cả quần thể không dồn hết vào cùng một
   * frame — giãn tải, đỡ giật (xem docs/xiangqi.md).
   */
  _startGame() {
    this.game = new Xiangqi();
    this.viewGame = this.game; // render đọc thế cờ ĐANG chơi, cập nhật từng nước
    this.bot = createBot(this.currentLevel);
    this.moves = 0;
    this._moveCooldown = (Math.random() * TICKS_PER_MOVE) | 0;
  }

  /** Điểm trực quan: cấp bot cao nhất đã hạ (0 nếu chưa thắng ai). */
  getScore() {
    return this.bestLevelBeaten;
  }

  /**
   * Chuỗi trạng thái NGẮN cho bảng "Top 20 realtime" (ui.js: updateRankTable —
   * hook TUỲ CHỌN, game khác không khai báo thì cột này bỏ qua). Lý do cần:
   * getScore() (cấp đã hạ) chỉ đổi khi THẮNG một ván — với cách chơi từng nước
   * mới (mỗi nước cách nhau TICKS_PER_MOVE tick), một cá thể có thể đứng yên ở
   * cùng 1 điểm số hàng trăm tick liền, khiến bảng trông như đứng hình. Chuỗi
   * này đổi MỖI NƯỚC (cấp đang đấu, số nước đã đi, và chính mạng của cá thể tự
   * chấm % Đỏ đang thắng — dùng lại đúng phép tính trong nnEvaluator.js) nên
   * bảng "sống" trở lại dù chưa ai thắng ván nào.
   * @returns {string|null} null nếu chưa gắn mạng (chưa sẵn sàng chơi)
   */
  getLiveStatus() {
    if (!this.net) return null;
    const out = this.net.forward(extractFeatures(this.game))[0]; // 0..1 — xem nnEvaluator.js
    return `Cấp ${this.currentLevel} · nước ${this.moves} · AI tự chấm ${Math.round(out * 100)}% thắng`;
  }

  /** Đặc trưng thế cờ đang hiển thị — để Trainer chạy net.forward (và vẽ "bộ não"). */
  getInputs() {
    return extractFeatures(this.viewGame);
  }

  /**
   * MỘT tick = MỘT nửa nước (1 ply) của ván đang chơi, có nhịp chờ để xem được
   * (TICKS_PER_MOVE) — thay cho cách cũ chơi trọn ván trong 1 tick (nặng, lag,
   * không xem được từng nước). Reward = 0 ở các tick giữa ván, chỉ dồn vào tick
   * KẾT THÚC ván (xem _finishGame). Cá thể chỉ "chết" (done=true) khi thua/hoà
   * hoặc đã hạ hết thang cấp — thắng thì tự mở ván mới với bot cấp cao hơn.
   * @param {number[]} _outputs — BỎ QUA: mạng dùng bên trong minimax, không phải
   *   để chọn hành động trực tiếp.
   * @returns {{reward:number, done:boolean}}
   */
  step(_outputs) {
    // Nhịp chờ giữa 2 nước: giữ nguyên thế cờ để mắt kịp theo dõi. Tick chờ
    // KHÔNG chạy minimax nên rất nhẹ — đây là chỗ giãn tải so với bản cũ.
    if (this._moveCooldown > 0) {
      this._moveCooldown--;
      return { reward: 0, done: false };
    }

    const g = this.game;

    // Đi đúng MỘT nửa nước: Đỏ = AI (minimax + NN của cá thể), Đen = bot heuristic.
    const m = g.turn() === 'r'
      ? searchBestMove(g, this.evalDepth, this.evaluate)
      : this.bot.chooseMove(g);
    if (m) { g.move(m); this.moves++; }

    // Ván kết thúc khi: hết nước (chiếu bí/hết cờ), thư viện báo game_over, hoặc
    // chạm trần số nước (bất phân => hoà). Chưa xong thì đặt lại nhịp chờ.
    const ended = !m || g.game_over() || this.moves >= this.moveLimit;
    if (!ended) {
      this._moveCooldown = TICKS_PER_MOVE - 1;
      return { reward: 0, done: false };
    }
    return this._finishGame();
  }

  /**
   * Ván vừa kết thúc → tính kết quả + reward + (nếu thắng) THĂNG CẤP và mở ván
   * mới. Tách khỏi step() cho gọn; công thức fitness GIỮ NGUYÊN như bản cũ.
   * @returns {{reward:number, done:boolean}}
   */
  _finishGame() {
    const g = this.game;
    const moves = this.moves;
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
      this.currentLevel++;                  // THĂNG CẤP cho ván sau
      done = this.currentLevel > MAX_LEVEL; // hạ hết thang thì kết thúc cá thể
      if (!done) this._startGame();         // mở ván mới với bot cấp cao hơn (chơi tiếp qua các tick sau)
    } else if (outcome === 'draw') {
      reward = DRAW_BASE - moves;           // hoà: hơn thua chút, nhưng hoà lê thê thì kém
      done = true;                          // không thăng cấp => dừng cá thể tại đây
    } else { // loss
      reward = moves;                       // thua: thưởng nhẹ theo số nước cầm cự được
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

    // Thanh trạng thái dưới cùng: đang đấu cấp mấy, nước thứ mấy, bên nào đi,
    // kết quả ván trước, và cấp cao nhất đã hạ.
    const resText = this.lastResult === 'win' ? '✓ thắng'
      : this.lastResult === 'loss' ? '✗ thua'
      : this.lastResult === 'draw' ? '½ hoà' : '…';
    const turnText = this.viewGame.game_over() ? 'xong'
      : (this.viewGame.turn() === 'r' ? 'Đỏ đi' : 'Đen đi');
    ctx.fillStyle = '#dce3f0';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `AI (Đỏ) vs Bot cấp ${this.currentLevel}  ·  nước ${this.moves} (${turnText})  ·  đã hạ tới cấp ${this.bestLevelBeaten}`,
      240, oy + bh + 26
    );
    ctx.fillStyle = '#8b96ad';
    ctx.font = '12px sans-serif';
    ctx.fillText(`ván trước: ${resText} (${this.lastMoves} nước)`, 240, oy + bh + 44);
  }
}
