/**
 * minimax.js — Tìm kiếm nước đi bằng Minimax + cắt tỉa Alpha-Beta.
 *
 * Thư viện xiangqi.js đã lo TOÀN BỘ luật cờ (sinh nước hợp lệ, chiếu, chiếu bí,
 * hoà). File này chỉ lo phần "suy nghĩ": duyệt cây nước đi tới độ sâu cho trước
 * và chọn nước tốt nhất theo một hàm ĐÁNH GIÁ truyền vào.
 *
 * Điểm mấu chốt của kiến trúc: `evaluate` là tham số. Bot dùng heuristicEvaluate
 * (cố định), còn Giai đoạn 2 truyền vào hàm đánh giá bằng MẠNG NƠ-RON — cùng một
 * minimax, chỉ đổi "khẩu vị" đánh giá thế cờ. Đó là lý do NN không chọn nước
 * trực tiếp mà chỉ thay hàm evaluate.
 *
 * Dùng negamax: ở mỗi nút, điểm = max(-điểm của đối thủ ở nút con). Nhờ vậy chỉ
 * cần evaluate theo góc nhìn "bên đang đi" là đủ cho cả hai bên.
 */

const MATE = 1_000_000; // điểm cho thế chiếu bí (bên bị chiếu bí thua tuyệt đối)

/**
 * Sắp xếp nước đi: ưu tiên nước ĂN QUÂN, ăn quân to trước (MVV).
 * Cắt tỉa alpha-beta hiệu quả hơn nhiều khi xét nước tốt trước — nếu không,
 * độ sâu 4 sẽ chậm không dùng được.
 */
function orderMoves(moves) {
  const val = { k: 10000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };
  return moves.sort((m1, m2) => {
    const c1 = m1.captured ? val[m1.captured] : 0;
    const c2 = m2.captured ? val[m2.captured] : 0;
    return c2 - c1;
  });
}

/**
 * Negamax lõi có alpha-beta.
 * @param {Xiangqi} game — instance thư viện (bị move()/undo() tại chỗ, không clone)
 * @param {number} depth — số tầng còn lại
 * @param {number} alpha @param {number} beta — biên cắt tỉa
 * @param {(g:Xiangqi)=>number} evaluate — đánh giá theo góc nhìn bên đang đi
 * @param {number} ply — độ sâu đã đi (để ưu tiên chiếu bí SỚM)
 * @param {{nodes:number}} stat — đếm số nút đã duyệt (thống kê)
 * @returns {number} điểm thế cờ theo góc nhìn bên đang đi
 */
function negamax(game, depth, alpha, beta, evaluate, ply, stat) {
  stat.nodes++;

  // Nút lá (đủ sâu): đánh giá tĩnh. Sinh nước hợp lệ của thư viện RẤT đắt nên
  // ở lá ta CHỈ kiểm tra chiếu bí khi đang bị chiếu (rẻ) — đại đa số lá không
  // bị chiếu nên bỏ qua được lời gọi moves() tốn kém.
  if (depth === 0) {
    if (game.in_check() && game.moves().length === 0) return -MATE + ply;
    return evaluate(game);
  }

  // Nút trong: cần danh sách nước để đi tiếp. Hết nước = bị chiếu bí / hết cờ
  // => THUA cho bên đang đi. Trừ ply để "thắng nhanh" được ưu tiên hơn.
  // (Hoà do lặp thế / giới hạn nước được xử lý ở vòng lặp ván, không ở đây —
  //  gọi in_draw() mỗi nút sẽ làm tìm kiếm chậm gấp nhiều lần.)
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return -MATE + ply;

  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    game.move(m);
    const score = -negamax(game, depth - 1, -beta, -alpha, evaluate, ply + 1, stat);
    game.undo();

    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // cắt tỉa beta: đối thủ sẽ không cho nhánh này xảy ra
  }
  return best;
}

/**
 * Tìm nước đi tốt nhất từ thế hiện tại và trả về DANH SÁCH nước đã chấm điểm
 * (đã sắp xếp giảm dần). bot.js cần cả danh sách này để chọn ngẫu nhiên trong
 * top-K ở các cấp yếu.
 *
 * @param {Xiangqi} game
 * @param {number} depth — độ sâu tìm kiếm (>=1)
 * @param {(g:Xiangqi)=>number} evaluate
 * @returns {{ scored: {move:object, score:number}[], nodes:number }}
 */
export function searchScored(game, depth, evaluate) {
  const stat = { nodes: 0 };
  const rootMoves = orderMoves(game.moves({ verbose: true }));
  const scored = [];

  // Luồng alpha qua các nước gốc: nước tốt nhất tới đâu thì siết cửa sổ tới đó,
  // giúp cắt tỉa mạnh ở những nước gốc kém (nếu không, độ sâu 4 chậm gấp ~20 lần).
  // Nước tốt nhất luôn có điểm CHÍNH XÁC; các nước kém hơn có thể chỉ là cận trên
  // — vẫn đủ dùng cho việc bốc top-K ở các cấp yếu.
  let alpha = -Infinity;
  for (const m of rootMoves) {
    game.move(m);
    // Điểm của nước m = -điểm tốt nhất mà ĐỐI THỦ đạt được sau đó.
    const score = -negamax(game, depth - 1, -Infinity, -alpha, evaluate, 1, stat);
    game.undo();
    scored.push({ move: m, score });
    if (score > alpha) alpha = score;
  }

  scored.sort((a, b) => b.score - a.score);
  return { scored, nodes: stat.nodes };
}

/**
 * Tiện ích: chỉ lấy nước tốt nhất (dùng khi không cần chọn ngẫu nhiên).
 * @returns {object|null} move verbose, hoặc null nếu hết nước (đã thua)
 */
export function searchBestMove(game, depth, evaluate) {
  const { scored } = searchScored(game, depth, evaluate);
  return scored.length ? scored[0].move : null;
}
