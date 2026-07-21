/**
 * 2048.js — Environment 2048.
 *
 * Khác Flappy (1 hành động ngưỡng), 2048 có 4 hành động rời rạc: lên/phải/
 * xuống/trái — dùng ARGMAX như Snake (chọn output lớn nhất). Bàn 4x4, ô 0 =
 * trống, còn lại là luỹ thừa của 2.
 *
 * Mỗi cá thể một bàn riêng nhưng CÙNG SEED (mulberry32) => tile mới sinh ra ở
 * cùng vị trí/giá trị cho toàn quần thể mỗi thế hệ — so fitness công bằng,
 * giống nguyên tắc đã dùng ở flappy.js/snake.js.
 *
 * Điểm mục tiêu (getScore) là Ô LỚN NHẤT đạt được, không phải tổng điểm —
 * đúng mục tiêu thật của 2048. Tăng theo NẤC (2→4→8→16…) chứ không mượt —
 * mỗi nấc là một "đột phá chiến thuật" mới của quần thể.
 *
 * HAI CHẾ ĐỘ CHƠI (option `searchDepth`, tương tự "số ống nhìn trước" của
 * Flappy — xem configFor):
 *   searchDepth = 1  → POLICY thuần: mạng có 4 output, argmax (đã mask) chính
 *                      là hướng đi. Mạng tự quyết định, không nhìn trước.
 *   searchDepth = 2/3 → EXPECTIMAX: mạng chuyển vai, chỉ còn 1 output = "thế
 *                      cờ này tốt cỡ nào". Việc chọn hướng do cây tìm kiếm lo
 *                      (nước mình → ô ngẫu nhiên sinh ra → nước mình → …), mạng
 *                      chỉ chấm điểm các thế cờ lá. Đây đúng cách các AI 2048
 *                      mạnh hoạt động, và cũng là cách js/xiangqi đang dùng
 *                      minimax + nnEvaluator.
 *
 * Interface chung: xem mô tả ở đầu flappy.js.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZE = 4;
const DIRS = ['up', 'right', 'down', 'left']; // khớp thứ tự 4 output (argmax)
const MAX_TILE_FOR_NORM = 11; // log2(2048) — mốc chuẩn hoá input; dải input đúng bằng
                               // dải giá trị AI thực sự gặp (bàn cờ hiếm khi vượt 2048),
                               // trước đây dùng 16 (log2 65536) khiến mọi ô 2..64 dồn
                               // hết vào 0.06–0.375, mạng gần như nhìn thấy bàn cờ phẳng lì.

// =====================================================================
// 4 ĐẶC TRƯNG CHIẾN THUẬT (tuỳ chọn — người dùng tích ở UI)
//
// Đây là 4 "mẹo" kinh điển rút ra từ phân tích ván chơi của AI 2048 mạnh
// (Randal S. Olson). Mỗi mẹo được quy về MỘT SỐ 0..1 và nối thêm vào cuối
// vector input — tức là ta CHO AI NHÌN THẤY khái niệm đó, chứ KHÔNG ép nó
// chơi theo. Mạng vẫn phải tự học "góc còn nguyên thì tốt hay xấu" qua chọn
// lọc; ta chỉ tiết kiệm cho nó công tự phát minh ra khái niệm từ 16 ô rời rạc.
//
// CỐ Ý KHÔNG cộng thẳng vào reward: thưởng trực tiếp cho "độ đơn điệu" hay
// "số ô đầy" là mời gọi reward hacking — AI sẽ tối đa hoá chính con số đó
// thay vì chơi giỏi (vd đứng yên giữ bàn cờ đẹp mà không bao giờ gộp lên).
// Làm input thì fitness vẫn chỉ đo ô lớn nhất đạt được, an toàn hơn hẳn.
//
// Ở chế độ expectimax (searchDepth >= 2) mấy đặc trưng này còn đúng chỗ hơn:
// mạng lúc đó là HÀM LƯỢNG GIÁ, và các AI 2048 mạnh nhất đều lượng giá thế cờ
// bằng đúng tổ hợp có trọng số của 4 khái niệm này.
// =====================================================================

/** log2 an toàn cho ô trống (coi như 0). */
function lg(v) {
  return v === 0 ? 0 : Math.log2(v);
}

/** MẸO 1 — ô lớn nhất có đang nằm ở 1 trong 4 góc không (1/0). */
function featCorner(board) {
  let max = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (board[r][c] > max) max = board[r][c];
  if (max === 0) return 0;
  const L = SIZE - 1;
  return (board[0][0] === max || board[0][L] === max
    || board[L][0] === max || board[L][L] === max) ? 1 : 0;
}

/**
 * MẸO 2 — độ ĐƠN ĐIỆU: các ô có xếp thành dãy tăng/giảm đều theo hàng & cột
 * không (64 cạnh 32 cạnh 16 cạnh 8…). 1 = hoàn hảo, 0 = lộn xộn.
 *
 * Với mỗi hàng/cột, tính tổng mức "đi ngược chiều" theo cả 2 chiều rồi lấy
 * chiều RẺ HƠN làm hình phạt — dòng đơn điệu theo bất kỳ chiều nào cũng được
 * điểm cao (không ép phải dồn về một phía cố định).
 */
function featMonotonicity(board) {
  let penalty = 0;
  for (let i = 0; i < SIZE; i++) {
    const lines = [
      [board[i][0], board[i][1], board[i][2], board[i][3]], // hàng i
      [board[0][i], board[1][i], board[2][i], board[3][i]], // cột i
    ];
    for (const line of lines) {
      let inc = 0;
      let dec = 0;
      for (let k = 0; k + 1 < SIZE; k++) {
        const d = lg(line[k + 1]) - lg(line[k]);
        if (d > 0) inc += d; else dec += -d;
      }
      penalty += Math.min(inc, dec);
    }
  }
  // 24 = mốc chuẩn hoá theo kinh nghiệm: bàn cờ lộn xộn thật sự hiếm khi vượt
  // mức phạt này, nên chia 24 rồi kẹp cho ra dải 0..1 dùng được.
  return 1 - Math.min(1, penalty / 24);
}

/** MẸO 3 — độ LẤP ĐẦY: bao nhiêu phần bàn cờ đang có quân (AI giỏi giữ 12–15/16). */
function featOccupancy(board) {
  let filled = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (board[r][c] !== 0) filled++;
  return filled / (SIZE * SIZE);
}

/**
 * MẸO 4 — số CẶP KỀ NHAU BẰNG NHAU (tức số nước gộp đang bày sẵn). Ván hay
 * của AI có 2/3 số nước đi bày ra từ 2 cặp trở lên, cực đại ~6.
 */
function featMergePairs(board) {
  let pairs = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (c + 1 < SIZE && board[r][c + 1] === v) pairs++;
      if (r + 1 < SIZE && board[r + 1][c] === v) pairs++;
    }
  }
  return Math.min(1, pairs / 8); // 8 = trần thực tế, chia ra dải 0..1 đủ rộng
}

/**
 * Danh mục đặc trưng chiến thuật. THỨ TỰ TRONG MẢNG NÀY LÀ CỐ ĐỊNH — nó quyết
 * định vị trí input, mà vị trí input quyết định bố cục gen; đổi thứ tự là làm
 * hỏng mọi gen đã lưu. Thêm mẹo mới thì NỐI VÀO CUỐI.
 */
export const STRATEGY_FEATURES = [
  { key: 'corner', label: 'ô lớn ở góc', compute: featCorner },
  { key: 'mono', label: 'xếp thẳng hàng', compute: featMonotonicity },
  { key: 'occupancy', label: 'độ lấp đầy', compute: featOccupancy },
  { key: 'merges', label: 'cặp gộp được', compute: featMergePairs },
];

// ---- BẢNG MÀU 2048 GỐC (gabrielecirulli / aj-r.github.io/2048-AI) ----
const BG_PAGE = '#faf8ef';   // nền trang
const BG_GRID = '#bbada0';   // khung bàn cờ + hộp điểm
const BG_CELL = 'rgba(238, 228, 218, 0.35)'; // ô trống
const TEXT_DARK = '#776e65'; // chữ tiêu đề & ô 2/4
const TEXT_LIGHT = '#f9f6f2'; // chữ trên ô từ 8 trở lên
const FONT = '"Clear Sans", "Helvetica Neue", Arial, sans-serif';

// Màu ô theo giá trị; từ 4096 trở lên dùng màu tối chung như bản gốc.
const TILE_COLOR = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f',
  64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850',
  1024: '#edc53f', 2048: '#edc22e',
};
// Ô >= 128 trong bản gốc có thêm quầng sáng (box-shadow vàng) — càng to càng rõ.
const TILE_GLOW = {
  128: 0.24, 256: 0.32, 512: 0.40, 1024: 0.48, 2048: 0.56,
};

// ---- NHỊP ANIMATION (tính bằng tick) ----
// Bản gốc: trượt 100ms ease-in-out, rồi ô mới/ô vừa gộp nảy lên trong 200ms.
// Ở tốc độ x1 (1 tick ≈ 1 khung hình ≈ 16ms) thì 6 tick ≈ 100ms, 12 tick ≈ 200ms.
const SLIDE_TICKS = 6;
const POP_TICKS = 12;

// Số tick "chờ" giữa 2 nước đi thật sự. LÝ DO CẦN CÁI NÀY: khác Flappy/Snake
// (mỗi tick chỉ là một bước vật lý NHỎ, trông mượt tự nhiên), một tick của
// 2048 là CẢ MỘT NƯỚC ĐI (bàn cờ đổi hẳn) — ở tốc độ x1 (1 tick/khung hình,
// ~60fps) sẽ ra 60 nước/giây, mắt không kịp đọc số. TICKS_PER_MOVE giữ nhịp
// "1 nước thật mỗi TICKS_PER_MOVE tick" để tốc độ x1 xem được rõ ràng; người
// dùng vẫn có thể kéo slider tốc độ lên để tua nhanh như bình thường.
const TICKS_PER_MOVE = 60;

// ---- THAM SỐ EXPECTIMAX (chỉ dùng khi searchDepth >= 2) ----
// Nút NGẪU NHIÊN của 2048 rất "rộng": mỗi ô trống có thể sinh ra 2 (90%) hoặc
// 4 (10%), tức tới 15 × 2 = 30 nhánh con — nhân qua 3 tầng là hàng trăm nghìn
// lá, trình duyệt không kham nổi khi phải chạy cho cả trăm cá thể mỗi thế hệ.
// GIẢI PHÁP: chỉ mở rộng tối đa MAX_CHANCE_CELLS ô trống, LẤY MẪU RẢI ĐỀU
// (stride) trên danh sách ô trống rồi coi các ô đã lấy là đồng xác suất. Vì
// mọi ô trống vốn có xác suất bằng nhau, đây là ước lượng KHÔNG CHỆCH của giá
// trị kỳ vọng thật, chỉ nhiễu hơn — đổi độ chính xác lấy tốc độ.
const MAX_CHANCE_CELLS = 4;
const SPAWN_OUTCOMES = [[2, 0.9], [4, 0.1]]; // [giá trị ô mới, xác suất]

export class Game2048Env {
  /**
   * Config MẶC ĐỊNH (searchDepth = 1 => policy 4 output). Khi người dùng bật
   * expectimax, Trainer/UI lấy config động qua `configFor(opts)` — KHÔNG dùng
   * trực tiếp static này (giống FlappyEnv.configFor với lookahead).
   */
  static config = {
    name: '2048',
    inputs: 20,  // 16 ô bàn cờ (log2 chuẩn hoá) + 4 cờ "hướng này đi được không"
    outputs: 4,  // lên / phải / xuống / trái — chọn argmax
    inputLabels: [
      'r0c0', 'r0c1', 'r0c2', 'r0c3', 'r1c0', 'r1c1', 'r1c2', 'r1c3',
      'r2c0', 'r2c1', 'r2c2', 'r2c3', 'r3c0', 'r3c1', 'r3c2', 'r3c3',
      'đi lên?', 'đi phải?', 'đi xuống?', 'đi trái?',
    ],
    outputLabels: ['lên', 'phải', 'xuống', 'trái'],
    scoreLabel: 'Ô lớn nhất',
  };

  /** Kẹp độ sâu tìm kiếm về 1..3 (1 = không tìm kiếm, dùng policy thuần). */
  static _normDepth(v) {
    return Math.max(1, Math.min(3, Math.round(Number(v) || 1)));
  }

  /**
   * Chuẩn hoá danh sách mẹo chiến thuật người dùng tích: lọc bỏ key lạ và LUÔN
   * trả về đúng thứ tự khai báo trong STRATEGY_FEATURES — thứ tự tick trên UI
   * không được phép ảnh hưởng tới bố cục input/gen.
   * @returns {typeof STRATEGY_FEATURES}
   */
  static _normStrategies(v) {
    if (!Array.isArray(v)) return [];
    return STRATEGY_FEATURES.filter((f) => v.includes(f.key));
  }

  /**
   * Config ĐỘNG theo 2 option riêng của 2048:
   *   `searchDepth` đổi VAI TRÒ mạng ⇒ đổi số OUTPUT:
   *     depth 1  → 4 output = 4 hướng (mạng là policy, tự chọn nước)
   *     depth ≥2 → 1 output = điểm đánh giá thế cờ (mạng là hàm lượng giá cho
   *                expectimax; chọn nước là việc của cây tìm kiếm)
   *   `strategies` thêm đặc trưng chiến thuật ⇒ đổi số INPUT (mỗi mẹo +1).
   * Cả hai đều đổi độ dài gen nên KHÔNG resume được từ lần chạy cũ —
   * main.js kiểm tra tương thích giống như với lookahead của Flappy.
   */
  static configFor(opts = {}) {
    const depth = Game2048Env._normDepth(opts.searchDepth);
    const strategies = Game2048Env._normStrategies(opts.strategies);
    const base = Game2048Env.config;

    const config = { ...base };
    if (strategies.length) {
      config.inputs = base.inputs + strategies.length;
      config.inputLabels = [...base.inputLabels, ...strategies.map((f) => f.label)];
    }
    if (depth >= 2) {
      config.name = `2048 (expectimax ${depth} tầng)`;
      config.outputs = 1;
      config.outputLabels = ['đánh giá thế cờ'];
    }
    return config;
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.searchDepth=1] — 1 = policy thuần, 2/3 = expectimax
   * @param {string[]} [opts.strategies=[]] — key các mẹo chiến thuật bật thêm
   *   (xem STRATEGY_FEATURES); mỗi mẹo nối thêm 1 input vào cuối vector.
   */
  constructor(opts = {}) {
    this.searchDepth = Game2048Env._normDepth(opts.searchDepth);
    this.strategies = Game2048Env._normStrategies(opts.strategies);
    this.net = null; // chỉ dùng khi searchDepth >= 2 (mạng làm hàm lượng giá)
    this.reset(0);
  }

  /**
   * Trainer gọi hook này để đưa mạng của cá thể vào (xem ga.js). Ở chế độ
   * expectimax mạng thành HÀM ĐÁNH GIÁ thế cờ nên env phải tự giữ tham chiếu
   * — outputs truyền vào step() lúc đó không còn ý nghĩa hành động nữa.
   */
  attachNetwork(net) {
    this.net = net;
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
    this.score = 0;
    this.maxTile = 0;
    this.ticks = 0;
    this.lastGained = 0;
    this._moveCooldown = 0; // đếm ngược tick chờ trước khi cho phép nước đi tiếp theo
    this._anim = null;      // ảnh chụp nước đi gần nhất, để render() vẽ animation
    this._spawnTile();
    this._spawnTile();
  }

  getScore() {
    return this.maxTile;
  }

  /** Đặt 1 ô mới (90% giá trị 2, 10% giá trị 4) vào một ô trống ngẫu nhiên. */
  _spawnTile() {
    const empties = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.board[r][c] === 0) empties.push([r, c]);
    if (empties.length === 0) return null;
    const [r, c] = empties[(this.rng() * empties.length) | 0];
    this.board[r][c] = this.rng() < 0.9 ? 2 : 4;
    return [r, c];
  }

  /** Trích 1 "dòng" 4 ô theo hướng di chuyển (đích đến luôn ở đầu mảng). */
  _getLine(board, dir, i) {
    switch (dir) {
      case 'left': return [board[i][0], board[i][1], board[i][2], board[i][3]];
      case 'right': return [board[i][3], board[i][2], board[i][1], board[i][0]];
      case 'up': return [board[0][i], board[1][i], board[2][i], board[3][i]];
      case 'down': return [board[3][i], board[2][i], board[1][i], board[0][i]];
    }
  }

  /** Ghi 1 dòng đã trượt/gộp trở lại bàn cờ, đảo ngược đúng theo hướng. */
  _setLine(board, dir, i, line) {
    switch (dir) {
      case 'left': board[i] = line.slice(); break;
      case 'right': board[i] = line.slice().reverse(); break;
      case 'up': for (let r = 0; r < SIZE; r++) board[r][i] = line[r]; break;
      case 'down': for (let r = 0; r < SIZE; r++) board[SIZE - 1 - r][i] = line[r]; break;
    }
  }

  /**
   * Luật cốt lõi của 2048: nén các ô khác 0 về đầu dòng, rồi gộp 2 ô liền kề
   * bằng nhau (mỗi ô chỉ gộp 1 lần/nước đi — không gộp dây chuyền 3 ô liên tiếp).
   *
   * `moves` ghi lại HÀNH TRÌNH của từng ô (chỉ số cũ -> chỉ số mới) để render()
   * vẽ được animation trượt. Mỗi ô khác 0 của dòng cũ xuất hiện đúng 1 lần;
   * hai ô gộp vào nhau có cùng `to` và cùng cờ `merged`.
   * @returns {{ line:number[], gained:number, changed:boolean, moves:object[] }}
   */
  _slideLineLeft(line) {
    const filtered = [];
    for (let i = 0; i < SIZE; i++) if (line[i] !== 0) filtered.push({ v: line[i], from: i });
    const merged = [];
    const moves = [];
    let gained = 0;
    for (let i = 0; i < filtered.length; i++) {
      const to = merged.length;
      if (i + 1 < filtered.length && filtered[i].v === filtered[i + 1].v) {
        const val = filtered[i].v * 2;
        merged.push(val);
        gained += val;
        moves.push({ from: filtered[i].from, to, value: filtered[i].v, merged: true });
        moves.push({ from: filtered[i + 1].from, to, value: filtered[i].v, merged: true });
        i++; // bỏ qua ô đã gộp, tránh gộp tiếp lần 2
      } else {
        merged.push(filtered[i].v);
        moves.push({ from: filtered[i].from, to, value: filtered[i].v, merged: false });
      }
    }
    while (merged.length < SIZE) merged.push(0);
    const changed = merged.some((v, i) => v !== line[i]);
    return { line: merged, gained, changed, moves };
  }

  /** Chỉ số thứ `idx` trên "dòng" thứ `i` theo hướng `dir` là ô nào trên bàn cờ. */
  _lineToCell(dir, i, idx) {
    switch (dir) {
      case 'left': return [i, idx];
      case 'right': return [i, SIZE - 1 - idx];
      case 'up': return [idx, i];
      case 'down': return [SIZE - 1 - idx, i];
    }
  }

  /** Hướng `dir` có làm bàn cờ thay đổi không — dùng để lọc hành động hợp lệ. */
  _canMove(board, dir) {
    for (let i = 0; i < SIZE; i++) {
      if (this._slideLineLeft(this._getLine(board, dir, i)).changed) return true;
    }
    return false;
  }

  /** Còn nước đi nào không (theo cả 4 hướng) — hết thì ván kết thúc. */
  _hasAnyMove(board) {
    return DIRS.some((d) => this._canMove(board, d));
  }

  /**
   * Áp dụng nước đi lên một BẢN SAO của board (không đụng bàn cờ gốc) — cần
   * cho expectimax vì cây tìm kiếm phải thử nhiều nhánh giả định.
   * @returns {{ board:number[][], gained:number, changed:boolean }}
   */
  _applyMove(board, dir) {
    const next = board.map((row) => row.slice());
    let gained = 0;
    let changed = false;
    for (let i = 0; i < SIZE; i++) {
      const res = this._slideLineLeft(this._getLine(next, dir, i));
      this._setLine(next, dir, i, res.line);
      gained += res.gained;
      if (res.changed) changed = true;
    }
    return { board: next, gained, changed };
  }

  // -------------------------------------------------------------------
  // EXPECTIMAX — chỉ chạy khi searchDepth >= 2.
  //
  // Cây xen kẽ 2 loại nút:
  //   MAX    (lượt mình): thử 4 hướng, lấy nhánh có giá trị CAO NHẤT.
  //   CHANCE (lượt game): game thả 1 ô mới vào chỗ trống ngẫu nhiên — không
  //          chọn được, nên lấy giá trị KỲ VỌNG (trung bình có trọng số).
  // Lá cây được chấm điểm bằng mạng nơ-ron của cá thể (_evalBoard) — đó là
  // thứ GA thực sự tiến hoá ở chế độ này.
  // -------------------------------------------------------------------

  /** Chấm điểm một thế cờ bằng mạng của cá thể. Càng cao càng tốt. */
  _evalBoard(board) {
    if (!this.net) return 0;
    return this.net.forward(this._featuresOf(board))[0];
  }

  /**
   * Nút MAX: chọn hướng cho giá trị cao nhất.
   * @param {number} depth — còn bao nhiêu LƯỢT ĐI CỦA MÌNH được nhìn trước
   * @returns {{ value:number, dir:string|null }} dir = null nghĩa là bàn đã bí
   */
  _expectimaxMax(board, depth) {
    let bestValue = -Infinity;
    let bestDir = null;
    for (const dir of DIRS) {
      const res = this._applyMove(board, dir);
      if (!res.changed) continue; // hướng bị chặn — bỏ qua (chính là action masking)
      // Tầng cuối thì chấm điểm luôn, còn không thì đi tiếp qua nút CHANCE.
      const value = depth <= 1
        ? this._evalBoard(res.board)
        : this._expectimaxChance(res.board, depth);
      if (value > bestValue) { bestValue = value; bestDir = dir; }
    }
    return { value: bestValue, dir: bestDir };
  }

  /**
   * Nút CHANCE: game thả ô mới vào một ô trống bất kỳ. Lấy trung bình giá trị
   * qua các khả năng (đã rút gọn theo MAX_CHANCE_CELLS — xem chú thích hằng số).
   */
  _expectimaxChance(board, depth) {
    const empties = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c] === 0) empties.push([r, c]);
    if (empties.length === 0) return this._evalBoard(board);

    // Lấy mẫu rải đều: bước nhảy `stride` để các ô chọn ra trải khắp bàn cờ
    // thay vì dồn hết vào góc trên-trái như khi cắt `empties.slice(0, N)`.
    const stride = Math.max(1, Math.ceil(empties.length / MAX_CHANCE_CELLS));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < empties.length; i += stride) {
      const [r, c] = empties[i];
      for (const [value, prob] of SPAWN_OUTCOMES) {
        board[r][c] = value; // đặt thử rồi hoàn nguyên — tránh copy cả bàn cờ
        const res = this._expectimaxMax(board, depth - 1);
        // dir = null: nhánh này làm bàn bí ngay — chấm điểm thế cờ chết đó.
        sum += prob * (res.dir === null ? this._evalBoard(board) : res.value);
        board[r][c] = 0;
      }
      n++;
    }
    return sum / n;
  }

  /**
   * GIÁC QUAN của một thế cờ BẤT KỲ — 20 số 0..1 (+ mỗi mẹo chiến thuật đã
   * bật thì thêm 1 số nữa ở cuối):
   *  [0..15] giá trị từng ô, chuẩn hoá log2(v)/11 (0 nếu ô trống)
   *  [16..19] hướng này có đi được không (1/0) — giúp AI thấy trước nguy cơ bí bàn
   *  [20...] các đặc trưng chiến thuật đã tích (xem STRATEGY_FEATURES)
   * Tách khỏi getInputs() để expectimax chấm điểm được các thế cờ giả định.
   */
  _featuresOf(board) {
    const cells = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = board[r][c];
        cells.push(v === 0 ? 0 : Math.min(1, Math.log2(v) / MAX_TILE_FOR_NORM));
      }
    const canMoveFlags = DIRS.map((d) => (this._canMove(board, d) ? 1 : 0));
    const strategyFeats = this.strategies.map((f) => f.compute(board));
    return [...cells, ...canMoveFlags, ...strategyFeats];
  }

  /** Giác quan của bàn cờ ĐANG chơi — Trainer gọi mỗi tick (xem ga.js). */
  getInputs() {
    return this._featuresOf(this.board);
  }

  /**
   * Chọn hướng đi cho nước này — điểm rẽ nhánh giữa 2 chế độ (xem đầu file).
   *   searchDepth 1  → argmax MASKED trên 4 output của mạng (policy thuần).
   *   searchDepth ≥2 → expectimax, mạng chỉ làm hàm chấm điểm thế cờ lá.
   * Cả 2 nhánh đều chỉ trả về hướng HỢP LỆ, hoặc null khi bàn đã bí thật sự.
   * @returns {string|null}
   */
  _chooseDir(outputs) {
    if (this.searchDepth >= 2 && this.net) {
      return this._expectimaxMax(this.board, this.searchDepth).dir;
    }
    // Argmax MASKED: chỉ so sánh output của các hướng làm bàn cờ đổi được.
    let best = -Infinity;
    let bestDir = null;
    for (let i = 0; i < DIRS.length; i++) {
      if (!this._canMove(this.board, DIRS[i])) continue;
      if (outputs[i] > best) { best = outputs[i]; bestDir = DIRS[i]; }
    }
    return bestDir;
  }

  /**
   * Một tick = một nước đi. Hướng đi do _chooseDir quyết định (policy hoặc
   * expectimax tuỳ searchDepth).
   *
   * ACTION MASKING: argmax chỉ xét trong số các hướng HỢP LỆ (làm bàn cờ thay
   * đổi), bỏ qua hoàn toàn output của các hướng bị chặn — thay vì để AI tự
   * chọn tự do rồi phạt chết khi chọn sai. Lý do đổi: kiểu "sai nước = chết"
   * cũ khiến phần lớn áp lực chọn lọc bị đốt vào việc học lại một luật đã
   * biết sẵn (hướng nào đi được) thay vì học chiến thuật gộp ô thật sự.
   * Vẫn CHẶN được lỗi kẹt vô hạn của mạng tất định (lý do ban đầu cần cơ chế
   * chết): vì luôn chọn trong tập hướng hợp lệ nên bàn cờ luôn thay đổi mỗi
   * tick, không có chuyện đứng yên lặp lại input cũ. Chỉ khi KHÔNG còn hướng
   * nào hợp lệ (bàn đã bí thật sự) mới kết thúc ván.
   *
   * AI vẫn có sẵn 4 cờ "hướng này đi được không" trong input — giờ dùng để
   * dự đoán trước tình huống bí bàn, không còn cần để "tránh chết".
   */
  step(outputs) {
    this.ticks++;

    // Đang trong thời gian "chờ" giữa 2 nước — chưa cho đi, giữ nguyên bàn cờ
    // để mắt kịp nhìn nước vừa rồi. Không thưởng/phạt, không kết thúc ván.
    if (this._moveCooldown > 0) {
      this._moveCooldown--;
      return { reward: 0, done: false };
    }

    const dir = this._chooseDir(outputs);

    // Không còn hướng nào hợp lệ => bàn đã bí, ván kết thúc thật sự.
    if (dir === null) {
      this.lastGained = 0;
      return { reward: 0, done: true };
    }

    const { gained, over } = this._commitMove(dir);
    if (!over) this._moveCooldown = TICKS_PER_MOVE - 1; // giữ nhịp cho nước tiếp theo

    // Reward: +1 sống sót mỗi nước (tín hiệu dày cho thế hệ đầu, kể cả chưa
    // gộp được ô nào) + điểm ghi được từ gộp ô (chia nhỏ để không lấn át tín
    // hiệu sống sót ở giai đoạn đầu khi các nước gộp còn hiếm).
    const reward = 1 + gained / 4;
    return { reward, done: over };
  }

  /**
   * Thực thi MỘT nước đi theo hướng đã chọn: trượt + gộp cả 4 dòng, ghi
   * animation, sinh ô mới, cập nhật score/maxTile. Tách khỏi step() để dùng
   * chung cho cả AI train (step) LẪN người chơi/AI ở màn chơi thử (humanMove).
   * Giả định `dir` HỢP LỆ (gọi từ chỗ đã lọc _canMove/_chooseDir).
   * @returns {{ gained:number, over:boolean }}
   */
  _commitMove(dir) {
    // Trượt + gộp toàn bộ 4 dòng theo hướng đã chọn, đồng thời gom hành trình
    // của từng ô (đổi từ toạ độ "trên dòng" sang toạ độ bàn cờ) cho animation.
    let gained = 0;
    const anim = { startTick: this.ticks, moves: [], spawn: null };
    for (let i = 0; i < SIZE; i++) {
      const res = this._slideLineLeft(this._getLine(this.board, dir, i));
      this._setLine(this.board, dir, i, res.line);
      gained += res.gained;
      for (const m of res.moves) {
        const [fr, fc] = this._lineToCell(dir, i, m.from);
        const [tr, tc] = this._lineToCell(dir, i, m.to);
        anim.moves.push({ fr, fc, tr, tc, value: m.value, merged: m.merged });
      }
    }
    this.score += gained;
    this.lastGained = gained;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        this.maxTile = Math.max(this.maxTile, this.board[r][c]);

    anim.spawn = this._spawnTile();
    this._anim = anim;
    return { gained, over: !this._hasAnyMove(this.board) };
  }

  /** Ván đã hết nước đi chưa (bí cả 4 hướng). */
  isOver() {
    return !this._hasAnyMove(this.board);
  }

  /**
   * MÀN CHƠI THỬ (play.js): đi 1 nước theo hướng NGƯỜI/AI chỉ định, bỏ qua
   * mạng/argmax/cooldown của step(). Không đổi `ticks` (vòng lặp vẽ ở play.js
   * tự tăng ticks mỗi frame để chạy animation).
   * @param {'up'|'right'|'down'|'left'} dir
   * @returns {{ moved:boolean, over:boolean }} moved=false nếu hướng bị chặn.
   */
  humanMove(dir) {
    if (!this._canMove(this.board, dir)) return { moved: false, over: this.isOver() };
    const { over } = this._commitMove(dir);
    return { moved: true, over };
  }

  /**
   * Hướng model KHUYÊN đi cho thế cờ HIỆN TẠI — dùng cho "AI gợi ý" và "AI
   * chơi hộ" ở màn chơi thử. Cùng logic step() dùng khi train: policy thì
   * argmax MASKED trên output mạng, expectimax thì cây tìm kiếm. null = bí bàn.
   * @param {NeuralNetwork} net
   * @returns {string|null}
   */
  recommendDir(net) {
    if (this.searchDepth >= 2) this.net = net; // expectimax dùng net làm hàm lượng giá
    return this._chooseDir(net.forward(this.getInputs()));
  }

  // ---------------------------------------------------------------------
  // RENDER — mô phỏng lại giao diện 2048 gốc (nền kem, khung nâu, ô bo góc)
  // cùng 2 animation đặc trưng: ô TRƯỢT về vị trí mới, rồi ô mới sinh/ô vừa
  // gộp NẢY lên. Vì đây là canvas (không phải DOM/CSS như bản gốc), animation
  // được nội suy thủ công theo số tick đã trôi kể từ nước đi gần nhất.
  // ---------------------------------------------------------------------

  /** Hình chữ nhật bo góc — ô 2048 gốc có border-radius 3px. */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  /** Vẽ 1 ô có giá trị `v` tại tâm (cx, cy), phóng to `scale` lần. */
  _drawTile(ctx, cx, cy, size, v, scale = 1) {
    const s = size * scale;
    const x = cx - s / 2;
    const y = cy - s / 2;

    // Quầng sáng của ô lớn (bản gốc dùng box-shadow vàng cho ô >= 128)
    const glow = TILE_GLOW[v];
    if (glow) {
      ctx.save();
      ctx.shadowColor = `rgba(243, 215, 116, ${glow})`;
      ctx.shadowBlur = size * 0.35;
      ctx.fillStyle = TILE_COLOR[v] || '#3c3a32';
      this._roundRect(ctx, x, y, s, s, 3);
      ctx.restore();
    } else {
      ctx.fillStyle = TILE_COLOR[v] || '#3c3a32';
      this._roundRect(ctx, x, y, s, s, 3);
    }

    // Chữ số: co lại khi số dài ra, đúng như các cỡ font của bản gốc.
    const digits = String(v).length;
    const base = digits <= 2 ? 0.5 : digits === 3 ? 0.42 : digits === 4 ? 0.34 : 0.26;
    ctx.fillStyle = v <= 4 ? TEXT_DARK : TEXT_LIGHT;
    ctx.font = `bold ${Math.round(size * base * scale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
  }

  /** mode 'full' = vẽ cả bàn 4x4; mode 'agent' bỏ qua (không có ý nghĩa chồng bầy). */
  render(ctx, mode = 'full') {
    if (mode !== 'full') return;

    const W = 480;
    const GAP = 12;
    const gridSize = 440;
    const CELL = (gridSize - (SIZE + 1) * GAP) / SIZE;
    const ox = (W - gridSize) / 2;
    const oy = 78;
    // Tâm của ô (r, c) trên canvas — dùng chung cho cả bàn tĩnh lẫn animation.
    const cx = (c) => ox + GAP + c * (CELL + GAP) + CELL / 2;
    const cy = (r) => oy + GAP + r * (CELL + GAP) + CELL / 2;

    ctx.fillStyle = BG_PAGE;
    ctx.fillRect(0, 0, W, 600);


    // --- Khung bàn cờ + các ô trống ---
    ctx.fillStyle = BG_GRID;
    this._roundRect(ctx, ox, oy, gridSize, gridSize, 6);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        ctx.fillStyle = BG_CELL;
        this._roundRect(ctx, cx(c) - CELL / 2, cy(r) - CELL / 2, CELL, CELL, 3);
      }
    }

    // --- Các ô có giá trị ---
    const anim = this._anim;
    const elapsed = anim ? this.ticks - anim.startTick : Infinity;

    if (anim && elapsed < SLIDE_TICKS) {
      // GIAI ĐOẠN 1 — TRƯỢT: vẽ các ô của bàn cờ TRƯỚC nước đi, nội suy từ
      // vị trí cũ tới vị trí mới. Ô sắp gộp vẫn giữ giá trị cũ (2 ô cùng đi
      // về một đích, chồng lên nhau đúng lúc kết thúc) — y như bản gốc.
      const t = elapsed / SLIDE_TICKS;
      const e = t * t * (3 - 2 * t); // smoothstep ≈ ease-in-out
      for (const m of anim.moves) {
        const x = cx(m.fc) + (cx(m.tc) - cx(m.fc)) * e;
        const y = cy(m.fr) + (cy(m.tr) - cy(m.fr)) * e;
        this._drawTile(ctx, x, y, CELL, m.value);
      }
    } else {
      // GIAI ĐOẠN 2 — bàn cờ mới. Ô vừa gộp và ô mới sinh được phóng to/thu
      // nhỏ theo thời gian: ô gộp nảy 1 → 1.2 → 1, ô mới lớn dần 0 → 1.
      const popT = anim ? Math.min(1, (elapsed - SLIDE_TICKS) / POP_TICKS) : 1;
      const mergedAt = new Set();
      if (anim && popT < 1) {
        for (const m of anim.moves) if (m.merged) mergedAt.add(m.tr * SIZE + m.tc);
      }
      const spawnAt = anim && anim.spawn ? anim.spawn[0] * SIZE + anim.spawn[1] : -1;

      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = this.board[r][c];
          if (v === 0) continue;
          let scale = 1;
          if (popT < 1) {
            const key = r * SIZE + c;
            // Nảy: đi lên 1.2 ở nửa đầu rồi về 1 ở nửa sau.
            if (mergedAt.has(key)) scale = popT < 0.5 ? 1 + 0.4 * popT : 1.2 - 0.4 * popT;
            else if (key === spawnAt) scale = popT; // ô mới: nở ra từ 0
          }
          this._drawTile(ctx, cx(c), cy(r), CELL, v, scale);
        }
      }
    }

    // --- Lớp phủ "hết nước đi" (bản gốc: nền kem mờ + chữ lớn) ---
    if (!this._hasAnyMove(this.board)) {
      ctx.fillStyle = 'rgba(238, 228, 218, 0.73)';
      this._roundRect(ctx, ox, oy, gridSize, gridSize, 6);
      ctx.fillStyle = TEXT_DARK;
      ctx.font = `bold 46px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Game over!', ox + gridSize / 2, oy + gridSize / 2);
    }
  }
}
