/**
 * heuristic.js — Hàm ĐÁNH GIÁ THẾ CỜ CỐ ĐỊNH (không phải mạng nơ-ron).
 *
 * Đây là "bộ não" của bot đối thủ (bot.js) — do con người thiết kế sẵn, KHÔNG
 * học gì cả. Ở Giai đoạn 2, mạng nơ-ron (nnEvaluator.js) sẽ THAY THẾ đúng vai
 * trò này để minimax dùng, và trọng số mạng mới là thứ được tiến hoá.
 *
 * Nguyên tắc chấm điểm: cộng giá trị mọi quân của ĐỎ, trừ giá trị mọi quân
 * của ĐEN (điểm dương = Đỏ lợi thế), rồi cộng vài yếu tố vị trí đơn giản.
 *
 * Đọc bàn cờ qua API board() của thư viện xiangqi.js:
 *   board() -> mảng 10 hàng × 9 cột; row 0 = ĐEN ở trên, row 9 = ĐỎ ở dưới.
 *   mỗi ô = null (trống) hoặc { type: 'k|a|b|n|r|c|p', color: 'r|b' }.
 */

// Giá trị quân tiêu chuẩn (đơn vị ~ "1 con Tốt = 100").
// Tướng để cực lớn để mọi thế mất Tướng đều bị định giá bằng thắng/thua tuyệt đối.
export const PIECE_VALUE = {
  k: 10000, // Tướng (将/帅)
  r: 900,   // Xe   (车)  — quân mạnh nhất
  c: 450,   // Pháo (炮)
  n: 400,   // Mã   (马)
  b: 200,   // Tượng(象)
  a: 200,   // Sĩ   (士)
  p: 100,   // Tốt  (卒/兵)
};

// Tốt qua sông cộng thêm bằng này (Tốt qua sông mạnh hơn hẳn Tốt nhà).
const PAWN_CROSSED_BONUS = 100;
// Thưởng nhỏ cho quân đứng gần cột trung tâm (cột 4) — kiểm soát trung lộ.
const CENTER_FILE_BONUS = 6;

/**
 * Đánh giá TUYỆT ĐỐI theo góc nhìn ĐỎ: điểm dương = Đỏ lợi thế.
 * @param {Array<Array<null|{type:string,color:string}>>} board — kết quả g.board()
 * @returns {number}
 */
export function evaluateBoard(board) {
  let score = 0;
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const cell = board[row][col];
      if (!cell) continue;

      let v = PIECE_VALUE[cell.type];

      // Tốt qua sông: Đỏ (ở dưới) qua sông khi lên nửa trên (row <= 4);
      // Đen (ở trên) qua sông khi xuống nửa dưới (row >= 5).
      if (cell.type === 'p') {
        const crossed = cell.color === 'r' ? row <= 4 : row >= 5;
        if (crossed) v += PAWN_CROSSED_BONUS;
      }

      // Kiểm soát trung tâm: càng gần cột 4 càng được thưởng nhẹ.
      v += (4 - Math.abs(4 - col)) * CENTER_FILE_BONUS / 4;

      // Cộng cho Đỏ, trừ cho Đen.
      score += cell.color === 'r' ? v : -v;
    }
  }
  return score;
}

/**
 * Đánh giá theo GÓC NHÌN CỦA BÊN ĐANG ĐI (điểm dương = bên sắp đi đang lợi).
 * Đây là chữ ký mà minimax.js cần; nnEvaluator.js cũng xuất cùng chữ ký để
 * thay thế được trực tiếp.
 * @param {Xiangqi} game — instance thư viện (đọc turn() + board())
 * @returns {number}
 */
export function heuristicEvaluate(game) {
  const abs = evaluateBoard(game.board());
  return game.turn() === 'r' ? abs : -abs;
}
