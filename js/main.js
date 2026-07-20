/**
 * main.js — Điểm khởi động: nối UI ↔ Trainer ↔ Environment và chạy vòng lặp chính.
 *
 * VÒNG LẶP MỖI FRAME (requestAnimationFrame ~60fps):
 *   1. Chạy `speed` tick mô phỏng (speed = x1..x50 — tua nhanh việc học,
 *      chỉ tăng số tick vật lý mỗi frame, KHÔNG đổi luật chơi).
 *   2. Nếu cả bầy đã chết → trainer.onGenerationEnd(): có thể chỉ là hết 1
 *      dàn ống (nếu seedsPerGen > 1, chơi lại dàn khác trước khi tiến hoá),
 *      hoặc thực sự evolve() sang thế hệ mới + vẽ lại biểu đồ.
 *   3. Vẽ trạng thái hiện tại lên canvas + cập nhật bảng thống kê.
 */

import { Trainer } from './ga.js';
import { UI } from './ui.js';
import { registry } from './environments/registry.js';
import { analyzeRun } from './analysis.js';
import { saveRun, loadHistoryEntry, archOf, archId } from './storage.js';
import { ComparisonRun } from './compare.js';

const ui = new UI();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let trainer = null;      // được tạo khi bấm Start
let running = false;     // đang mô phỏng?
let paused = false;      // đang tạm dừng?
let targetScore = null;  // điểm mục tiêu (null = chạy vô hạn)
let lastSettings = null; // thông số của lần chạy hiện tại (để tổng kết)

let compareRun = null;   // "Trước vs Sau" đang chạy — độc lập hoàn toàn với trainer
let comparing = false;   // vòng lặp compareLoop có nên tiếp tục request frame kế không

/**
 * Gộp envOptions + config ĐỘNG (đã tính theo option riêng của game) cho 1 lần
 * chạy. Flappy đổi số input theo `lookahead`, 2048 đổi số output theo
 * `searchDepth` — cả hai phải hỏi entry.configFor; game không có configFor
 * thì dùng config tĩnh như cũ.
 */
function resolveEnv(s) {
  const entry = registry[s.gameKey];
  const envOptions = {
    evalDepth: s.evalDepth, startLevel: s.startLevel, moveLimit: 100,
    lookahead: s.lookahead,       // Flappy: số ống nhìn trước (game khác bỏ qua)
    searchDepth: s.searchDepth,   // 2048: độ sâu expectimax (game khác bỏ qua)
    strategies: s.strategies,     // 2048: mẹo chiến thuật bật thêm (đổi số input)
  };
  const envConfig = entry.configFor ? entry.configFor(envOptions) : entry.config;
  return { entry, envOptions, envConfig };
}

/**
 * Tạo Trainer mới từ thông số người dùng chọn trên UI.
 *
 * Nếu người dùng chọn "Tiếp tục từ lịch sử" (s.resume + s.resumeId), quần thể
 * khởi đầu được gây giống từ gen của MỤC LỊCH SỬ đó — xem ga.js (seedRanked)
 * và storage.js. UI đã khoá sẵn mọi thông số kiến trúc theo mục được chọn,
 * nhưng ta vẫn đối chiếu archId một lần nữa: nếu vì lý do gì đó không khớp
 * (dữ liệu cũ, người dùng nghịch DOM) thì thà chạy từ đầu còn hơn nạp gen sai
 * độ dài rồi vỡ ở NeuralNetwork.fromGenes.
 */
function createTrainer(s) {
  const { entry, envOptions, envConfig } = resolveEnv(s);
  const saved = s.resume && s.resumeId ? loadHistoryEntry(s.gameKey, s.resumeId) : null;
  const compatible = saved && saved.id === archId(archOf(s));
  const seedRanked = compatible ? saved.ranked : null;

  return new Trainer({
    envFactory: entry.create,
    envConfig,
    popSize: s.popSize,
    mutationRate: s.mutationRate,
    hiddenNodes: s.hiddenNodes,
    maxStepsPerGen: 999999,
    seedsPerGen: s.seedsPerGen,
    envOptions,
    seedRanked,
    startGeneration: seedRanked ? saved.generation : 1,
  });
}

/**
 * Đẩy thành tích của thế hệ vừa xong vào lịch sử — gọi sau mỗi trainer.evolve().
 * storage.saveRun() tự lo phần "chỉ ghi đè khi TỐT HƠN kỉ lục cũ của cùng bộ
 * thông số", nên gọi mỗi thế hệ là an toàn: chạy tệ hơn thì lịch sử đứng yên.
 */
function persistProgress() {
  if (!trainer || !lastSettings || !trainer.lastRanked || !trainer.lastRanked.length) return;
  return saveRun(lastSettings.gameKey, {
    arch: archOf(lastSettings),
    popSize: lastSettings.popSize,
    mutationRate: lastSettings.mutationRate,
    generation: trainer.generation,
    bestFitness: trainer.bestEver,
    bestScore: trainer.bestEverScore,
    ranked: trainer.lastRanked,
  });
}

/** Vẽ frame hiện tại: con giỏi nhất vẽ 'full', bầy còn lại vẽ 'agent' mờ. */
function renderFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!trainer) {
    // Màn hình chờ trước khi Start
    ctx.fillStyle = '#8b96ad';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chọn thông số rồi bấm ▶ Start để bắt đầu tiến hoá', canvas.width / 2, canvas.height / 2);
    return;
  }

  const best = trainer.bestAlive();
  if (!best) return; // khoảnh khắc chuyển thế hệ

  // Con giỏi nhất vẽ đầy đủ (nền + ống + chim). Vì mọi env cùng seed,
  // dàn ống của nó cũng chính là dàn ống của cả bầy.
  best.env.render(ctx, 'full');

  // Bầy còn lại: chỉ vẽ agent mờ, trừ khi bật "chỉ hiện con giỏi nhất"
  if (!ui.isBestOnly()) {
    for (const ind of trainer.aliveIndividuals()) {
      if (ind !== best) ind.env.render(ctx, 'agent');
    }
  }
}

/** Vòng lặp chính. */
function loop() {
  if (running && !paused && trainer) {
    // --- 1. Tua `speed` tick mô phỏng trong 1 frame vẽ ---
    const speed = ui.getSpeed();
    for (let t = 0; t < speed; t++) {
      const alive = trainer.stepAll();

      // --- 2. Cả bầy chết → chơi hết dàn ống này, có thể còn seed khác để
      // đánh giá (seedsPerGen) trước khi thực sự tiến hoá sang thế hệ mới. ---
      if (alive === 0) {
        const evolved = trainer.onGenerationEnd();
        if (evolved) {
          persistProgress(); // lưu gen tốt nhất — sống sót qua reload/lần chạy sau
          ui.drawChart(trainer.history);
          ui.drawScoreChart(trainer.history);
          ui.updateCompareAvailability(trainer); // đủ dữ liệu "Trước vs Sau" chưa
          ui.updateMilestones(trainer.milestones, trainer.envConfig.scoreLabel || 'Score');
          ui.drawHeatmap(trainer.netSizes, trainer.currentBestGenes, trainer.envConfig);
          ui.drawFitnessHistogram(trainer.lastGenerationFitnesses, trainer.bestEver);
        }
      }
    }

    // --- 3. Hiển thị ---
    ui.updateStats({
      generation: trainer.generation,
      alive: trainer.aliveIndividuals().length,
      popSize: trainer.popSize,
      best: trainer.currentBestFitness(),
      bestEver: trainer.bestEver,
      score: trainer.currentBestScore(),
      scoreEver: trainer.bestEverScore,
    });

    // --- 4. Đạt điểm mục tiêu → tự động dừng & tổng kết ---
    if (targetScore !== null && trainer.bestEverScore >= targetScore) {
      finishRun('target');
    }

    // Bảng xếp hạng top 20 — tự bỏ qua vẽ lại nếu chưa đổi gì (xem ui.js)
    ui.updateRankTable(
      trainer.topRanked(20),
      trainer.envConfig.scoreLabel || 'Score',
      trainer.aliveIndividuals().length,
      trainer.popSize,
    );
  }

  renderFrame();
  // Vẽ "bộ não" của con giỏi nhất mỗi frame (kể cả khi pause — xem tĩnh cũng được)
  ui.drawNetwork(trainer ? trainer.bestAlive()?.net ?? null : null);
  requestAnimationFrame(loop);
}

/**
 * Kết thúc một lần chạy: dừng vòng lặp, phân tích lịch sử và hiện modal
 * tổng kết + đề xuất chỉ số. Gọi khi bấm Stop hoặc khi đạt điểm mục tiêu.
 * @param {'target'|'manual'} reason
 */
function finishRun(reason) {
  if (!trainer) return;
  running = false;
  paused = false;
  ui.setRunningState(false); // mở khoá thông số để người dùng chỉnh theo đề xuất
  const analysis = analyzeRun(trainer, lastSettings, reason);
  ui.showSummary(analysis);
  ui.refreshResumeInfo(); // dữ liệu đã lưu vừa cập nhật theo tiến độ mới nhất
}

/**
 * Bắt đầu 1 lượt "Trước vs Sau": dựng ComparisonRun từ gen đã chụp sẵn trong
 * trainer (gen1BestGenes vs currentBestGenes), rồi tự chạy bằng vòng lặp
 * rAF RIÊNG — hoàn toàn độc lập với vòng lặp huấn luyện chính (loop() vẫn
 * chạy song song bình thường, không bị chặn hay ảnh hưởng gì).
 */
function startComparison() {
  if (!trainer || !trainer.hasComparisonData() || comparing) return;
  compareRun = new ComparisonRun({
    netSizes: trainer.netSizes,
    envFactory: trainer.envFactory,
    envOptions: trainer.envOptions,
    beforeGenes: trainer.gen1BestGenes,
    afterGenes: trainer.currentBestGenes,
  });
  comparing = true;
  ui.setComparing(true);
  requestAnimationFrame(compareLoop);
}

/** Vòng lặp riêng cho "Trước vs Sau" — 1 tick/frame (~x1, đủ chậm để xem rõ). */
function compareLoop() {
  if (!compareRun || !comparing) return; // bị Reset huỷ giữa chừng
  const allDone = compareRun.step();
  ui.renderCompareFrame(compareRun);
  if (allDone) {
    comparing = false;
    ui.setComparing(false);
    return; // dừng hẳn, giữ nguyên khung hình cuối trên 2 canvas
  }
  requestAnimationFrame(compareLoop);
}

// ============ Gắn sự kiện các nút ============

ui.el.btnStart.addEventListener('click', () => {
  if (paused) {
    // Resume sau khi Pause
    paused = false;
  } else if (!running) {
    // Start mới: chốt thông số, tạo trainer, nạp metadata game cho UI
    const s = ui.readSettings();
    lastSettings = s;
    targetScore = s.targetScore; // null nếu để trống -> chạy vô hạn
    ui.setGameMeta(resolveEnv(s).envConfig); // config động: đúng nhãn input theo lookahead
    comparing = false; // trainer cũ (nếu có) đổi — dữ liệu "Trước vs Sau" cũ không còn hợp lệ
    compareRun = null;
    trainer = createTrainer(s);
    running = true;
    ui.drawChart([]);
    ui.drawScoreChart([]);
    ui.clearCompare();
    ui.clearMilestones();
    ui.drawHeatmap(null, null, null);
    ui.drawFitnessHistogram([], 0);
  }
  ui.setRunningState(true, false);
});

// Nút này 2 vai trò: đang chạy = Pause; đang pause = Stop (kết thúc + tổng kết)
ui.el.btnPause.addEventListener('click', () => {
  if (!running) return;
  if (!paused) {
    // Lần bấm 1: tạm dừng. Nút tự đổi nhãn thành "■ Stop".
    paused = true;
    ui.setRunningState(true, true);
  } else {
    // Lần bấm 2 (giờ là Stop): kết thúc & tổng kết quá trình
    finishRun('manual');
  }
});

ui.el.btnRunCompare.addEventListener('click', startComparison);

ui.el.btnReset.addEventListener('click', () => {
  // Xoá sạch mọi thứ, mở khoá thông số để chỉnh lại từ đầu
  trainer = null;
  running = false;
  paused = false;
  targetScore = null;
  comparing = false; // huỷ "Trước vs Sau" đang chạy dở (compareLoop tự dừng ở lần check kế tiếp)
  compareRun = null;
  ui.hideSummary();
  ui.setRunningState(false);
  ui.updateStats({ generation: 0, alive: 0, best: 0, bestEver: 0, score: 0, scoreEver: 0 });
  ui.drawChart([]);
  ui.drawScoreChart([]);
  ui.clearRankTable();
  ui.clearCompare();
  ui.clearMilestones();
  ui.drawHeatmap(null, null, null);
  ui.drawFitnessHistogram([], 0);
  ui.refreshResumeInfo();
});

// Đóng modal tổng kết (bấm nút hoặc click nền tối) — trainer vẫn giữ nguyên
// để xem lại biểu đồ; muốn chạy mới thì chỉnh chỉ số rồi bấm Start.
ui.el.btnSummaryClose.addEventListener('click', () => ui.hideSummary());
ui.el.summaryOverlay.addEventListener('click', (e) => {
  if (e.target === ui.el.summaryOverlay) ui.hideSummary();
});

// ============ Khởi động ============
ui.setRunningState(false);
ui.drawChart([]);
ui.drawScoreChart([]);
ui.clearCompare();
ui.drawHeatmap(null, null, null);
ui.drawFitnessHistogram([], 0);
requestAnimationFrame(loop);
