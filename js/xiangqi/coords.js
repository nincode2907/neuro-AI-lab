/**
 * coords.js — Chuyển đổi giữa (hàng, cột) của mảng board() và ô kiểu ICCS
 * mà thư viện xiangqi.js dùng cho moves()/move() (ví dụ 'a3', 'h2').
 *
 * board() cho mảng 10 hàng × 9 cột: row 0 = ĐEN ở trên, row 9 = ĐỎ ở dưới.
 * ICCS: cột = chữ 'a'..'i' (a = cột 0), hàng = số 0..9 nhưng ĐẢO so với mảng
 *   (hàng đáy Đỏ = mảng row 9 = ICCS rank 0), nên rank = 9 - row.
 */

export const FILES = 'abcdefghi';

/** (row, col) trong mảng board() -> ô ICCS, ví dụ (9,0) -> 'a0', (6,0) -> 'a3'. */
export const squareOf = (row, col) => FILES[col] + (9 - row);

/** Ô ICCS -> { row, col } trong mảng board(). */
export function rowColOf(square) {
  return { row: 9 - Number(square[1]), col: FILES.indexOf(square[0]) };
}
