/**
 * nnEvaluator.js — Hàm ĐÁNH GIÁ THẾ CỜ bằng MẠNG NƠ-RON (Giai đoạn 2).
 *
 * Đây là mấu chốt của việc cắm neuroevolution vào cờ tướng:
 *   NN KHÔNG chọn nước đi. NN chỉ THAY THẾ heuristic.js làm hàm chấm điểm thế cờ,
 *   còn việc tìm nước vẫn do minimax.js lo. Genome của mỗi cá thể = trọng số của
 *   mạng đánh giá này. Tiến hoá = tìm bộ trọng số chấm điểm thế cờ ngày càng giỏi.
 *
 * Vì minimax gọi hàm đánh giá ở RẤT nhiều nút lá, đặc trưng phải RẺ để trích và
 * mạng phải NHỎ — nên ta chỉ chạy minimax độ sâu thấp (1-2 tầng) khi huấn luyện.
 */

// Số lượng tối đa mỗi loại quân của một bên (để chuẩn hoá hiệu số quân về [-1,1]).
const MAX_COUNT = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 };
const TYPES = ['k', 'a', 'b', 'n', 'r', 'c', 'p'];

// Tổng số đặc trưng đầu vào của mạng (phải khớp config.inputs của environment).
export const FEATURE_COUNT = 14;

// Nhãn từng đặc trưng — để UI vẽ "bộ não" hiển thị AI đang nhìn vào gì.
export const FEATURE_LABELS = [
  'ΔTướng', 'ΔSĩ', 'ΔTượng', 'ΔMã', 'ΔXe', 'ΔPháo', 'ΔTốt',
  'Tốt đỏ qua sông', 'Tốt đen qua sông',
  'Đỏ trung tâm', 'Đen trung tâm',
  'Đỏ bị chiếu', 'Đen bị chiếu', 'Lượt đi',
];

// Biên độ điểm mà mạng có thể xuất (đơn vị ~ giá trị quân). Nhỏ hơn MATE rất
// nhiều để điểm chiếu bí luôn áp đảo điểm đánh giá tĩnh.
const SCALE = 3000;

/**
 * Trích ĐẶC TRƯNG của thế cờ theo GÓC NHÌN ĐỎ (không phụ thuộc ai đang đi, trừ
 * 2 đặc trưng "bị chiếu" và "lượt đi"). Tất cả nằm trong khoảng ~[-1, 1].
 *
 * Chỉ bên ĐANG ĐI mới có thể đang bị chiếu (bên vừa đi không thể để tướng mình
 * bị chiếu) — nhờ vậy tính được "ai bị chiếu" chỉ từ turn() + in_check(), rất rẻ.
 *
 * @param {Xiangqi} game
 * @returns {number[]} độ dài FEATURE_COUNT
 */
export function extractFeatures(game) {
  const board = game.board();
  const count = { r: {}, b: {} };
  for (const t of TYPES) { count.r[t] = 0; count.b[t] = 0; }

  let redCross = 0, blackCross = 0, redCenter = 0, blackCenter = 0;

  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const cell = board[row][col];
      if (!cell) continue;
      count[cell.color][cell.type]++;

      if (cell.type === 'p') {
        if (cell.color === 'r' && row <= 4) redCross++;
        if (cell.color === 'b' && row >= 5) blackCross++;
      }
      // Trung tâm = 3 cột giữa (cột 3,4,5)
      if (col >= 3 && col <= 5) {
        if (cell.color === 'r') redCenter++; else blackCenter++;
      }
    }
  }

  const turn = game.turn();
  const inCheck = game.in_check();
  const feats = [];

  // [0..6] hiệu số quân từng loại (đỏ - đen), chuẩn hoá
  for (const t of TYPES) feats.push((count.r[t] - count.b[t]) / MAX_COUNT[t]);
  // [7..8] số Tốt đã qua sông mỗi bên
  feats.push(redCross / 5);
  feats.push(blackCross / 5);
  // [9..10] số quân ở trung tâm mỗi bên
  feats.push(redCenter / 7);
  feats.push(blackCenter / 7);
  // [11] Đỏ đang bị chiếu, [12] Đen đang bị chiếu
  feats.push(turn === 'r' && inCheck ? 1 : 0);
  feats.push(turn === 'b' && inCheck ? 1 : 0);
  // [13] lượt đi (đỏ = 1, đen = 0)
  feats.push(turn === 'r' ? 1 : 0);

  return feats;
}

/**
 * Tạo hàm đánh giá dùng mạng nơ-ron `net`, CÙNG chữ ký với heuristicEvaluate
 * để minimax dùng thay thế trong suốt: evaluate(game) -> điểm theo góc nhìn
 * bên đang đi.
 *
 * Mạng xuất 1 số 0..1 (sigmoid) = "khả năng ĐỎ đang thắng". Ta quy về điểm có
 * dấu quanh 0 rồi lật theo bên đang đi.
 *
 * @param {NeuralNetwork} net — mạng [FEATURE_COUNT, ẩn, 1] do Trainer tạo
 * @returns {(game:Xiangqi)=>number}
 */
export function makeNNEvaluate(net) {
  return function evaluate(game) {
    const out = net.forward(extractFeatures(game)); // [0..1]
    const redAdvantage = (out[0] - 0.5) * 2 * SCALE; // -SCALE..+SCALE, dương = Đỏ lợi
    return game.turn() === 'r' ? redAdvantage : -redAdvantage;
  };
}
