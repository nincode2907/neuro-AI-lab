/**
 * bot.js — Bot chơi cờ tướng theo 7 CẤP ĐỘ (giống app cờ trên điện thoại).
 *
 * Bot LUÔN dùng hàm đánh giá cố định (heuristic.js) + minimax. Chỉ 2 tham số
 * tạo ra khác biệt sức mạnh giữa các cấp:
 *   1. depth        — độ sâu minimax. Sâu hơn = nhìn xa hơn = mạnh hơn (nhưng chậm).
 *   2. randomChance — xác suất KHÔNG chọn nước tốt nhất mà bốc ngẫu nhiên trong
 *      top-K nước hay nhất. Cấp thấp bốc ngẫu nhiên nhiều => hay đi nước dở,
 *      cho người mới thắng được; cấp cao gần như luôn chọn tối ưu.
 *
 * Elo ước lượng chỉ mang tính tương đối để bạn hình dung, không phải đo thật.
 */

import { heuristicEvaluate } from './heuristic.js';
import { searchScored } from './minimax.js';

/**
 * Bảng cấu hình 7 cấp. topK = số nước "hay nhất" được coi là ứng viên khi bốc
 * ngẫu nhiên. randomChance = tỉ lệ bốc ngẫu nhiên thay vì lấy nước số 1.
 */
export const LEVELS = {
  1: { depth: 1, topK: 6, randomChance: 0.80, elo: 400 },   // rất yếu, đi gần như ngẫu nhiên trong các nước tạm ổn
  2: { depth: 1, topK: 4, randomChance: 0.50, elo: 700 },
  3: { depth: 2, topK: 4, randomChance: 0.35, elo: 1000 },
  4: { depth: 2, topK: 3, randomChance: 0.20, elo: 1300 },
  5: { depth: 3, topK: 3, randomChance: 0.10, elo: 1600 },
  6: { depth: 3, topK: 2, randomChance: 0.05, elo: 1850 },
  7: { depth: 4, topK: 1, randomChance: 0.00, elo: 2100 },   // gần như luôn tối ưu (trong tầm nhìn 4 tầng)
};

export const MAX_LEVEL = 7;
export const MIN_LEVEL = 1;

export class Bot {
  /** @param {number} level — 1..7 */
  constructor(level) {
    this.level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level | 0));
    this.cfg = LEVELS[this.level];
  }

  /**
   * Chọn nước đi cho thế cờ hiện tại của `game`.
   * @param {Xiangqi} game — instance thư viện (bot đọc lượt qua game.turn())
   * @returns {object|null} move verbose để gọi game.move(), null nếu hết nước
   */
  chooseMove(game) {
    const { scored } = searchScored(game, this.cfg.depth, heuristicEvaluate);
    if (scored.length === 0) return null;

    // Có xác suất randomChance thì bốc ngẫu nhiên trong top-K (nước "đủ tốt"),
    // còn lại luôn lấy nước số 1. Đây là nguồn "sai lầm có kiểm soát" của cấp yếu.
    if (Math.random() < this.cfg.randomChance) {
      const k = Math.min(this.cfg.topK, scored.length);
      return scored[(Math.random() * k) | 0].move;
    }
    return scored[0].move;
  }
}

/** Factory tiện dụng. */
export function createBot(level) {
  return new Bot(level);
}
