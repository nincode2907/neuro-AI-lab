/**
 * storage.js — Lưu/đọc "lần chạy cuối cùng" của mỗi game vào localStorage.
 *
 * Mỗi lần evolve() xong một thế hệ, Trainer giữ lại top gen (xem
 * `Trainer.lastRanked` trong ga.js). main.js đẩy snapshot đó vào đây sau mỗi
 * thế hệ, để lần Start tiếp theo (kể cả sau khi tải lại trang) có thể chọn
 * "Tiếp tục lần chạy trước" thay vì luôn phải random quần thể từ đầu.
 *
 * Dữ liệu lưu theo từng game (key riêng), KHÔNG lẫn giữa Flappy/Snake/2048/...
 */

const PREFIX = 'neuroai:lastRun:';

/**
 * @param {string} gameKey — vd 'flappy', 'snake'
 * @param {{hiddenNodes:number, generation:number, bestFitness:number,
 *          bestScore:number, savedAt:number,
 *          ranked:{genes:number[], fitness:number}[]}} data
 */
export function saveLastRun(gameKey, data) {
  try {
    localStorage.setItem(PREFIX + gameKey, JSON.stringify(data));
  } catch {
    // localStorage đầy/bị chặn (chế độ ẩn danh...) — tính năng lưu chỉ là
    // tiện ích thêm, không được phép làm hỏng vòng lặp huấn luyện.
  }
}

/** @returns {object|null} dữ liệu đã lưu của game này, hoặc null nếu chưa có. */
export function loadLastRun(gameKey) {
  try {
    const raw = localStorage.getItem(PREFIX + gameKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLastRun(gameKey) {
  try {
    localStorage.removeItem(PREFIX + gameKey);
  } catch {
    // ignore
  }
}
