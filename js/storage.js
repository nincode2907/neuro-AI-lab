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
 * sẽ khập khiễng (evalDepth, startLevel, seedsPerGen). `popSize`, `mutationRate`
 * và `targetScore` được tự do chỉnh giữa các lần chạy — chúng chỉ ảnh hưởng
 * TỐC ĐỘ tìm kiếm hoặc lúc nào tự dừng, không ảnh hưởng bài toán hay hình
 * dạng genome; vẫn lưu lại 3 giá trị này để gợi nhớ lần trước chạy bằng gì
 * (xem UI: tag "tuned" ở mỗi mục lịch sử), chứ không dùng để khoá.
 */

const PREFIX = 'neuroai:history:';
const LEGACY_PREFIX = 'neuroai:lastRun:'; // định dạng cũ (1 snapshot/game)
const MAX_ENTRIES = 10;
// Trần số thế hệ giữ lại trong `history` (biểu đồ fitness/score theo thế hệ)
// của MỖI mục lịch sử — một lần chạy có thể kéo dài hàng nghìn thế hệ, lưu
// hết sẽ phình to localStorage vô ích; giữ HISTORY_CAP thế hệ GẦN NHẤT là đủ
// để biểu đồ tiếp diễn mượt mà ngay khi resume, xu hướng cũ hơn không còn
// nhiều giá trị tham khảo nữa.
const HISTORY_CAP = 500;

/**
 * Trích "bộ thông số kiến trúc" từ settings của UI. `strategies` được SẮP XẾP
 * để thứ tự người dùng tích không tạo ra 2 mục lịch sử khác nhau cho cùng một
 * cấu hình.
 */
export function archOf(s) {
  return {
    hiddenNodes: s.hiddenNodes,
    lookahead: s.lookahead ?? 1,
    searchDepth: s.searchDepth ?? 1,
    strategies: [...(s.strategies ?? [])].sort(),
    evalDepth: s.evalDepth ?? 1,
    startLevel: s.startLevel ?? 1,
    seedsPerGen: s.seedsPerGen ?? 1,
  };
}

/** Chuỗi định danh một cấu hình — 2 lần chạy cùng chuỗi này dùng CHUNG 1 mục. */
export function archId(arch) {
  return [
    arch.hiddenNodes, arch.lookahead, arch.searchDepth,
    arch.strategies.join('+') || '-',
    arch.evalDepth, arch.startLevel, arch.seedsPerGen,
  ].join('|');
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
    const arch = archOf(old);
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
 * `history`/`milestones`/`lastGenerationFitnesses` là dữ liệu BIỂU ĐỒ (xem
 * ga.js: Trainer#history/#milestones/#lastGenerationFitnesses) — lưu kèm để
 * khi resume, "Cột mốc học được", "Fitness theo thế hệ", "Ô lớn nhất theo thế
 * hệ" (đều nằm trong history[].score) và "Phân bố fitness cả quần thể" tiếp
 * diễn thay vì trắng trơn. `targetScore`/`popSize`/`mutationRate` không ảnh
 * hưởng genome nên chỉ lưu để GỢI NHỚ (hiện ở UI), không khoá lại khi nạp.
 *
 * @returns {boolean} có thực sự ghi không (false = kỉ lục cũ vẫn tốt hơn,
 *   hoặc mục mới không lọt nổi top MAX_ENTRIES)
 */
export function saveRun(gameKey, { arch, popSize, mutationRate, targetScore, generation,
  bestFitness, bestScore, ranked, history, milestones, lastGenerationFitnesses }) {
  if (!ranked || !ranked.length) return false;

  const id = archId(arch);
  const list = loadHistory(gameKey);
  const entry = {
    id, arch, popSize, mutationRate, targetScore, generation,
    bestFitness, bestScore, savedAt: Date.now(), ranked,
    history: (history || []).slice(-HISTORY_CAP),
    milestones: milestones || [],
    lastGenerationFitnesses: lastGenerationFitnesses || [],
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

// =====================================================================
// KHO "MODEL ĐÃ LƯU" — tách HẲN khỏi lịch sử train tự động ở trên.
//
// Lịch sử (PREFIX) là bản ghi thành tích tự cập nhật mỗi thế hệ, dùng để
// RESUME train tiếp. Kho model này khác hẳn về mục đích: người dùng CHỦ ĐỘNG
// bấm "Lưu model" để đóng băng cá thể top-1 của đợt train hiện tại thành một
// "sản phẩm" có tên, ĐỂ CHƠI THỬ ở màn chơi riêng (play.js) — read-only, không
// bao giờ bị train ghi đè. Mỗi model tự chứa đủ để tái dựng mạng: `arch` (suy
// ra netSizes + envOptions) và `genes` (trọng số phẳng của nhà vô địch).
// =====================================================================

const MODEL_PREFIX = 'neuroai:models:';
const MAX_MODELS = 50; // trần mỗi game — tránh phình localStorage vô hạn

function _writeModels(gameKey, list) {
  try {
    localStorage.setItem(MODEL_PREFIX + gameKey, JSON.stringify(list));
  } catch {
    // localStorage đầy/bị chặn — lưu model chỉ là tiện ích, không được làm vỡ app.
  }
}

/** Danh sách model đã lưu của 1 game, mới nhất trước. */
export function loadModels(gameKey) {
  try {
    const raw = localStorage.getItem(MODEL_PREFIX + gameKey);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Một model cụ thể theo id, hoặc null. */
export function loadModel(gameKey, id) {
  return loadModels(gameKey).find((m) => m.id === id) || null;
}

/**
 * Lưu 1 model mới (cá thể top-1 đang train). KHÔNG khử trùng lặp/không so tốt
 * hơn như saveRun — mỗi lần bấm là một bản chụp độc lập người dùng muốn giữ.
 * @returns {object} entry vừa tạo (đã có id)
 */
export function saveModel(gameKey, { name, arch, genes, score, fitness, generation }) {
  const entry = {
    id: `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    name: (name || '').trim() || `${gameKey} · ${score}`,
    gameKey, arch, genes,
    score, fitness, generation,
    savedAt: Date.now(),
  };
  const list = loadModels(gameKey);
  list.unshift(entry);
  _writeModels(gameKey, list.slice(0, MAX_MODELS));
  return entry;
}

/** Xoá 1 model khỏi kho. */
export function deleteModel(gameKey, id) {
  _writeModels(gameKey, loadModels(gameKey).filter((m) => m.id !== id));
}
