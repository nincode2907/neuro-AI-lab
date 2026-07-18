/**
 * main.js — Điểm khởi động: nối UI ↔ Trainer ↔ Environment và chạy vòng lặp chính.
 *
 * VÒNG LẶP MỖI FRAME (requestAnimationFrame ~60fps):
 *   1. Chạy `speed` tick mô phỏng (speed = x1..x50 — tua nhanh việc học,
 *      chỉ tăng số tick vật lý mỗi frame, KHÔNG đổi luật chơi).
 *   2. Nếu cả thế hệ đã chết → trainer.evolve() tạo thế hệ mới + vẽ lại biểu đồ.
 *   3. Vẽ trạng thái hiện tại lên canvas + cập nhật bảng thống kê.
 */

import { Trainer } from './ga.js';
import { UI } from './ui.js';
import { registry } from './environments/registry.js';
import { analyzeRun } from './analysis.js';

const ui = new UI();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let trainer = null;      // được tạo khi bấm Start
let running = false;     // đang mô phỏng?
let paused = false;      // đang tạm dừng?
let targetScore = null;  // điểm mục tiêu (null = chạy vô hạn)
let lastSettings = null; // thông số của lần chạy hiện tại (để tổng kết)

/** Tạo Trainer mới từ thông số người dùng chọn trên UI. */
function createTrainer() {
  const s = ui.readSettings();
  const entry = registry[s.gameKey];
  return new Trainer({
    envFactory: entry.create,
    envConfig: entry.config,
    popSize: s.popSize,
    mutationRate: s.mutationRate,
    hiddenNodes: s.hiddenNodes,
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

      // --- 2. Cả thế hệ chết → tiến hoá + cập nhật 2 biểu đồ ---
      if (alive === 0) {
        trainer.evolve();
        ui.drawChart(trainer.history);
        ui.drawScoreChart(trainer.history);
      }
    }

    // --- 3. Hiển thị ---
    ui.updateStats({
      generation: trainer.generation,
      alive: trainer.aliveIndividuals().length,
      best: trainer.currentBestFitness(),
      bestEver: trainer.bestEver,
      score: trainer.currentBestScore(),
      scoreEver: trainer.bestEverScore,
    });

    // --- 4. Đạt điểm mục tiêu → tự động dừng & tổng kết ---
    if (targetScore !== null && trainer.bestEverScore >= targetScore) {
      finishRun('target');
    }
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
    ui.setGameMeta(registry[s.gameKey].config);
    trainer = createTrainer();
    running = true;
    ui.drawChart([]);
    ui.drawScoreChart([]);
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

ui.el.btnReset.addEventListener('click', () => {
  // Xoá sạch mọi thứ, mở khoá thông số để chỉnh lại từ đầu
  trainer = null;
  running = false;
  paused = false;
  targetScore = null;
  ui.hideSummary();
  ui.setRunningState(false);
  ui.updateStats({ generation: 0, alive: 0, best: 0, bestEver: 0, score: 0, scoreEver: 0 });
  ui.drawChart([]);
  ui.drawScoreChart([]);
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
requestAnimationFrame(loop);
