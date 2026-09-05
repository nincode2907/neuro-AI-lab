/**
 * storage.js — LỊCH SỬ các lần chạy tốt nhất của mỗi game (localStorage).
 *
 * Trước đây mỗi game chỉ giữ ĐÚNG MỘT snapshot "lần chạy cuối" nên đổi thông
 * số là mất sạch tiến độ của cấu hình cũ. Giờ mỗi game giữ tối đa
 * MAX_ENTRIES mục, MỖI MỤC ỨNG VỚI MỘT BỘ THÔNG SỐ KIẾN TRÚC riêng:
 *
 *   - Chạy với cấu hình MỚI  → thêm một mục mới vào lịch sử.
 *   - Chạy tiếp một mục CŨ   → chỉ ghi đè mục đó KHI kết quả TỐT HƠN kỉ lục
 *                              của chính nó (xem `_isBetter`), nên lịch sử
 *                              luôn là "thành tích tốt nhất từng đạt" chứ
 *                              không bị một lần chạy xui làm hỏng.
 *
 * "Bộ thông số kiến trúc" (arch) = mọi thứ KHÔNG được phép đổi khi nạp lại
 * một mục: hoặc vì nó quyết định độ dài gen (hiddenNodes, lookahead,
 * searchDepth, strategies), hoặc vì nó đổi luật chơi nên so sánh thành tích
 * sẽ khập khiễng. `popSize`, `mutationRate` và `seedsPerGen` được tự do đổi
 * khi tiến hoá tiếp vì chúng không thay đổi hình dạng genome.
 */

const PREFIX = 'neuroai:history:';
const LEGACY_PREFIX = 'neuroai:lastRun:'; // định dạng cũ (1 snapshot/game)
const MAX_ENTRIES = 10;

/**
 * Trích "bộ thông số kiến trúc" từ settings của UI. `strategies` được SẮP XẾP
 * để thứ tự người dùng tích không tạo ra 2 mục lịch sử khác nhau cho cùng một
 * cấu hình.
 */
export function archOf(s) {
  const common = {
    schemaVersion: 2,
    game: s.gameKey,
    environmentVersion: s.environmentVersion || '1.0.0',
    networkType: 'feedforward',
    activation: 'tanh/sigmoid',
    hiddenNodes: s.hiddenNodes,
  };
  if (s.gameKey === 'flappy') return {
    ...common,
    inputSchema: `flappy-${s.lookahead ?? 1}-pipe-v1`,
    actionSchema: 'flap-binary-v1',
    lookahead: s.lookahead ?? 1,
  };
  if (s.gameKey === '2048') return {
    ...common,
    inputSchema: `2048-${[...(s.strategies ?? [])].sort().join('+') || 'raw'}-v1`,
    actionSchema: (s.searchDepth ?? 1) > 1 ? 'board-evaluator-v1' : 'move-policy-v1',
    searchDepth: s.searchDepth ?? 1,
    strategies: [...(s.strategies ?? [])].sort(),
  };
  return { ...common, inputSchema: 'snake-relative-6-v1', actionSchema: 'turn-relative-3-v1' };
}

/** Chuỗi định danh một cấu hình — 2 lần chạy cùng chuỗi này dùng CHUNG 1 mục. */
export function archId(arch) {
  const text = JSON.stringify(arch);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v2-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Mục nào "giỏi hơn": ưu tiên score của game, hoà thì xét fitness. */
function _isBetter(a, b) {
  if (a.bestScore !== b.bestScore) return a.bestScore > b.bestScore;
  return a.bestFitness > b.bestFitness;
}

function _write(gameKey, list) {
  try {
    localStorage.setItem(PREFIX + gameKey, JSON.stringify(list));
  } catch {
    // localStorage đầy/bị chặn (ẩn danh...) — lưu chỉ là tiện ích thêm,
    // không được phép làm hỏng vòng lặp huấn luyện.
  }
}

/**
 * Chuyển 1 snapshot định dạng CŨ thành mục lịch sử, gọi khi lịch sử còn rỗng
 * — để người dùng đã có tiến độ từ bản trước không mất trắng.
 */
function _migrateLegacy(gameKey) {
  try {
    const raw = localStorage.getItem(LEGACY_PREFIX + gameKey);
    if (!raw) return [];
    const old = JSON.parse(raw);
    if (!old || !old.ranked || !old.ranked.length) return [];
    const arch = archOf({ ...old, gameKey });
    const list = [{
      id: archId(arch),
      arch,
      popSize: null,      // bản cũ không lưu 2 thông số này
      mutationRate: null,
      generation: old.generation,
      bestFitness: old.bestFitness,
      bestScore: old.bestScore,
      savedAt: old.savedAt,
      ranked: old.ranked,
    }];
    _write(gameKey, list);
    localStorage.removeItem(LEGACY_PREFIX + gameKey);
    return list;
  } catch {
    return [];
  }
}

/**
 * Lịch sử của 1 game, đã xếp hạng giảm dần (giỏi nhất trước).
 * @returns {object[]} tối đa MAX_ENTRIES mục
 */
export function loadHistory(gameKey) {
  try {
    const raw = localStorage.getItem(PREFIX + gameKey);
    if (!raw) return _migrateLegacy(gameKey);
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Một mục cụ thể theo id, hoặc null. */
export function loadHistoryEntry(gameKey, id) {
  return loadHistory(gameKey).find((e) => e.id === id) || null;
}

/**
 * Ghi kết quả một lần chạy vào lịch sử.
 *
 * Cùng `arch` với mục đã có → CHỈ ghi đè khi tốt hơn (giữ kỉ lục cũ nếu lần
 * này chạy tệ hơn). Cấu hình mới → thêm mục mới, rồi cắt còn top MAX_ENTRIES
 * theo thành tích.
 *
 * @returns {boolean} có thực sự ghi không (false = kỉ lục cũ vẫn tốt hơn,
 *   hoặc mục mới không lọt nổi top MAX_ENTRIES)
 */
export function saveRun(gameKey, { arch, popSize, mutationRate, generation,
  bestFitness, bestScore, ranked, champion = null, experimentSeed = null }) {
  if (!ranked || !ranked.length) return false;

  const id = archId(arch);
  const list = loadHistory(gameKey);
  const exactBestFitness = champion?.fitness ?? bestFitness;
  const exactBestScore = champion?.score ?? bestScore;
  const entry = {
    id, arch, popSize, mutationRate, generation,
    bestFitness: exactBestFitness,
    bestScore: exactBestScore,
    champion,
    experimentSeed,
    savedAt: Date.now(), ranked,
  };

  const idx = list.findIndex((e) => e.id === id);
  if (idx >= 0) {
    if (!_isBetter(entry, list[idx])) return false; // chưa phá được kỉ lục cũ
    list[idx] = entry;
  } else {
    list.push(entry);
  }

  list.sort((a, b) => (_isBetter(a, b) ? -1 : 1));
  const trimmed = list.slice(0, MAX_ENTRIES);
  // Cấu hình mới mà thành tích không lọt nổi top → không ghi gì cả.
  if (!trimmed.some((e) => e.id === id)) return false;
  _write(gameKey, trimmed);
  return true;
}

/** Xoá 1 mục khỏi lịch sử. */
export function deleteHistoryEntry(gameKey, id) {
  _write(gameKey, loadHistory(gameKey).filter((e) => e.id !== id));
}

/** Xoá toàn bộ lịch sử của 1 game. */
export function clearHistory(gameKey) {
  try {
    localStorage.removeItem(PREFIX + gameKey);
    localStorage.removeItem(LEGACY_PREFIX + gameKey);
  } catch {
    // ignore
  }
}
