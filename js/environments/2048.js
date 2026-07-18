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
 * Điểm thú vị để quan sát: "Ô lớn nhất đạt được" tăng theo NẤC (2→4→8→16…)
 * chứ không mượt — mỗi nấc là một "đột phá chiến thuật" mới của quần thể.
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
const MAX_TILE_FOR_NORM = 16; // log2(65536) — mốc chuẩn hoá input, AI hiếm khi vượt quá

// Màu ô theo giá trị (bảng màu 2048 kinh điển); giá trị lớn hơn dùng màu tối chung.
const TILE_COLOR = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f',
  64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850',
  1024: '#edc53f', 2048: '#edc22e',
};

// Số tick "chờ" giữa 2 nước đi thật sự. LÝ DO CẦN CÁI NÀY: khác Flappy/Snake
// (mỗi tick chỉ là một bước vật lý NHỎ, trông mượt tự nhiên), một tick của
// 2048 là CẢ MỘT NƯỚC ĐI (bàn cờ đổi hẳn) — ở tốc độ x1 (1 tick/khung hình,
// ~60fps) sẽ ra 60 nước/giây, mắt không kịp đọc số. TICKS_PER_MOVE giữ nhịp
// "1 nước thật mỗi TICKS_PER_MOVE tick" để tốc độ x1 xem được rõ ràng; người
// dùng vẫn có thể kéo slider tốc độ lên để tua nhanh như bình thường.
const TICKS_PER_MOVE = 60;

export class Game2048Env {
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
    scoreLabel: 'Ô lớn nhất đạt được',
  };

  constructor() {
    this.reset(0);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
    this.score = 0;
    this.maxTile = 0;
    this.ticks = 0;
    this.lastGained = 0;
    this._moveCooldown = 0; // đếm ngược tick chờ trước khi cho phép nước đi tiếp theo
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
    if (empties.length === 0) return;
    const [r, c] = empties[(this.rng() * empties.length) | 0];
    this.board[r][c] = this.rng() < 0.9 ? 2 : 4;
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
   * @returns {{ line:number[], gained:number, changed:boolean }}
   */
  _slideLineLeft(line) {
    const filtered = line.filter((v) => v !== 0);
    const merged = [];
    let gained = 0;
    for (let i = 0; i < filtered.length; i++) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        const val = filtered[i] * 2;
        merged.push(val);
        gained += val;
        i++; // bỏ qua ô đã gộp, tránh gộp tiếp lần 2
      } else {
        merged.push(filtered[i]);
      }
    }
    while (merged.length < SIZE) merged.push(0);
    const changed = merged.some((v, i) => v !== line[i]);
    return { line: merged, gained, changed };
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
   * GIÁC QUAN — 20 số 0..1:
   *  [0..15] giá trị từng ô, chuẩn hoá log2(v)/16 (0 nếu ô trống)
   *  [16..19] hướng này có đi được không (1/0) — giúp AI tránh chọn nước vô nghĩa
   */
  getInputs() {
    const cells = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = this.board[r][c];
        cells.push(v === 0 ? 0 : Math.min(1, Math.log2(v) / MAX_TILE_FOR_NORM));
      }
    const canMoveFlags = DIRS.map((d) => (this._canMove(this.board, d) ? 1 : 0));
    return [...cells, ...canMoveFlags];
  }

  /**
   * Một tick = một nước đi. outputs có 4 giá trị — chọn ARGMAX làm hướng đi.
   *
   * "SAI NƯỚC = CHẾT": nếu hướng argmax là nước VÔ HIỆU (không làm đổi bàn cờ,
   * vì bị chặn hoặc bàn đã bí) thì KẾT THÚC VÁN ngay — giống triết lý flappy/
   * snake: một quyết định sai là chết. Đây vừa là cách tạo ĐƯỜNG HỌC ĐI LÊN rõ
   * rệt (thế hệ đầu bấm bừa vào tường nên chết sớm, dần học chọn hướng hợp lệ
   * và giữ bàn cờ gọn để đi xa hơn), vừa CHẶN LỖI KẸT VÔ HẠN: mạng nơ-ron tất
   * định, nếu chỉ "bỏ qua nước vô hiệu" thì nó sẽ chọn mãi đúng hướng bị chặn
   * đó (bàn cờ không đổi -> input không đổi) và ván không bao giờ kết thúc —
   * chính là lỗi "không qua nổi thế hệ 2" trước đây (cả quần thể đứng board,
   * thế hệ chỉ dừng khi chạm trần 8000 tick).
   *
   * AI có sẵn 4 cờ "hướng này đi được không" trong input để HỌC cách tránh chết.
   * (Flappy/Snake không gặp lỗi kẹt vì trạng thái của chúng luôn tự tiến.)
   */
  step(outputs) {
    this.ticks++;

    // Đang trong thời gian "chờ" giữa 2 nước — chưa cho đi, giữ nguyên bàn cờ
    // để mắt kịp nhìn nước vừa rồi. Không thưởng/phạt, không kết thúc ván.
    if (this._moveCooldown > 0) {
      this._moveCooldown--;
      return { reward: 0, done: false };
    }

    let act = 0;
    for (let i = 1; i < outputs.length; i++) if (outputs[i] > outputs[act]) act = i;
    const dir = DIRS[act];

    // Chọn nước vô hiệu (bị chặn / bàn đã bí) => chết ngay.
    if (!this._canMove(this.board, dir)) {
      this.lastGained = 0;
      return { reward: 0, done: true };
    }

    // Trượt + gộp toàn bộ 4 dòng theo hướng đã chọn
    let gained = 0;
    for (let i = 0; i < SIZE; i++) {
      const res = this._slideLineLeft(this._getLine(this.board, dir, i));
      this._setLine(this.board, dir, i, res.line);
      gained += res.gained;
    }
    this.score += gained;
    this.lastGained = gained;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        this.maxTile = Math.max(this.maxTile, this.board[r][c]);

    this._spawnTile();
    const over = !this._hasAnyMove(this.board);
    if (!over) this._moveCooldown = TICKS_PER_MOVE - 1; // giữ nhịp cho nước tiếp theo

    // Reward: +1 sống sót mỗi nước (tín hiệu dày cho thế hệ đầu, kể cả chưa
    // gộp được ô nào) + điểm ghi được từ gộp ô (chia nhỏ để không lấn át tín
    // hiệu sống sót ở giai đoạn đầu khi các nước gộp còn hiếm).
    const reward = 1 + gained / 4;
    return { reward, done: over };
  }

  /** mode 'full' = vẽ cả bàn 4x4; mode 'agent' bỏ qua (không có ý nghĩa chồng bầy). */
  render(ctx, mode = 'full') {
    if (mode !== 'full') return;

    const CELL = 96, GAP = 10;
    const gridSize = SIZE * CELL + (SIZE + 1) * GAP;
    const ox = (480 - gridSize) / 2;
    const oy = 70;

    ctx.fillStyle = '#0d1a12';
    ctx.fillRect(0, 0, 480, 600);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Điểm: ${this.score}`, 240, 40);

    // Khung nền bàn cờ
    ctx.fillStyle = '#1a2a1e';
    ctx.fillRect(ox, oy, gridSize, gridSize);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const x = ox + GAP + c * (CELL + GAP);
        const y = oy + GAP + r * (CELL + GAP);
        const v = this.board[r][c];

        ctx.fillStyle = v === 0 ? 'rgba(255,255,255,0.06)' : (TILE_COLOR[v] || '#3c3a32');
        ctx.fillRect(x, y, CELL, CELL);

        if (v !== 0) {
          ctx.fillStyle = v <= 4 ? '#3a3a3a' : '#f9f6f2';
          ctx.font = `bold ${v >= 1024 ? 26 : 32}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(v), x + CELL / 2, y + CELL / 2 + 2);
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Ô lớn nhất: ${this.maxTile}`, 240, oy + gridSize + 26);
  }
}
