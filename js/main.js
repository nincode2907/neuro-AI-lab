/** Nối UI, Trainer và state phiên chạy. rAF cũ không được ghi vào phiên mới. */
import { Trainer } from './ga.js';
import { UI } from './ui.js';
import { analyzeRun } from './analysis.js';
import { saveRun, prepareResume } from './storage.js';
import { resolveEnv } from './settings.js';
import { ComparisonRun } from './compare.js';
import { RunSession } from './session.js';

const ui = new UI();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const session = new RunSession();
let trainer = null;
let lastSettings = null;
let compareRun = null;
let compareId = 0;

function syncControls() {
  ui.setRunningState(['running','paused'].includes(session.state), session.state === 'paused', session.comparing);
  ui.updateSessionStatus(session, trainer);
}

function createTrainer(s) {
  const {entry,envOptions,envConfig} = resolveEnv(s);
  const source = s.resume ? prepareResume(s) : null;
  const next = new Trainer({envFactory:entry.create,envConfig,envOptions,
    popSize:s.popSize,mutationRate:s.mutationRate,hiddenNodes:s.hiddenNodes,
    maxStepsPerGen:s.episodeLimit,seedsPerGen:s.seedsPerGen,
    seedRanked:source?.seedRanked,startGeneration:source?.startGeneration ?? 1,
    seedChampion:source?.champion});
  if (source?.warning) ui.showStorageStatus(source.warning);
  return next;
}

function persistProgress() {
  if (!trainer?.latestPopulation || !lastSettings) return;
  const result = saveRun(lastSettings.gameKey, {settings:lastSettings,
    latestPopulation:trainer.latestPopulation,champion:trainer.champion});
  ui.showStorageStatus(result.ok
    ? `Đã lưu snapshot thế hệ ${trainer.latestPopulation.generation}; champion được giữ riêng.`
    : `Không lưu được: ${result.error} Phiên huấn luyện vẫn tiếp tục.`, !result.ok);
}

function cancelComparison() {
  if (session.comparing) ui.cancelCompare();
  compareId++;
  compareRun = null;
  session.comparing = false;
  ui.setComparing(false);
  ui.updateCompareAvailability(trainer);
}

function renderFrame() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!trainer) {
    ctx.fillStyle = '#8b96ad';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chọn thông số rồi bấm ▶ Start để bắt đầu tiến hoá',canvas.width/2,canvas.height/2);
    return;
  }
  const best = trainer.bestAlive();
  if (!best) return;
  best.env.render(ctx,'full');
  if (!ui.isBestOnly()) {
    for (const ind of trainer.aliveIndividuals()) if (ind !== best) ind.env.render(ctx,'agent');
  }
}

function finishRun(reason) {
  if (!trainer) return;
  cancelComparison();
  session.finish();
  syncControls();
  ui.showSummary(analyzeRun(trainer,lastSettings,reason));
  ui.refreshResumeInfo();
}

function stopReason() {
  if (lastSettings.targetScore !== null && trainer.bestEverScore >= lastSettings.targetScore) return 'target';
  return session.limitReason(trainer.history.length);
}

function drawGeneration() {
  persistProgress();
  ui.drawChart(trainer.history);
  ui.drawScoreChart(trainer.history);
  ui.updateCompareAvailability(trainer);
  ui.updateMilestones(trainer.milestones,trainer.envConfig.scoreLabel || 'Score');
  ui.drawHeatmap(trainer.netSizes,trainer.currentBestGenes,trainer.envConfig);
  ui.drawFitnessHistogram(trainer.lastGenerationFitnesses,trainer.bestEver);
}

function loop() {
  try {
    if (session.state === 'running' && trainer) {
      for (let t=0; t<ui.getSpeed(); t++) {
        const reason = stopReason();
        if (reason) {finishRun(reason); break;}
        if (trainer.stepAll() === 0 && trainer.onGenerationEnd()) drawGeneration();
        // Dừng ngay sau generation đạt target, không chạy dư các tick còn lại ở x50.
        const after = stopReason();
        if (after) {finishRun(after); break;}
      }
      ui.updateStats({generation:trainer.generation,alive:trainer.aliveIndividuals().length,
        popSize:trainer.popSize,best:trainer.currentBestFitness(),bestEver:trainer.bestEver,
        score:trainer.currentBestScore(),scoreEver:trainer.bestEverScore});
      ui.updateRankTable(trainer.topRanked(20),trainer.envConfig.scoreLabel || 'Score',
        trainer.aliveIndividuals().length,trainer.popSize);
      ui.updateSessionStatus(session,trainer);
    }
    renderFrame();
    ui.drawNetwork(trainer ? trainer.bestAlive()?.net ?? null : null);
  } catch (error) {
    if (session.state === 'running') finishRun('error');
    ui.showError(`Phiên đã dừng: ${error.message} Kiểm tra cấu hình rồi bắt đầu lại.`);
  }
  requestAnimationFrame(loop);
}

function compareLoop(token,runToken) {
  if (token !== compareId || runToken !== session.runId || !compareRun || !session.comparing) return;
  try {
    const finished = compareRun.step();
    ui.renderCompareFrame(compareRun);
    if (finished) {
      session.comparing = false;
      ui.setComparing(false);
      ui.updateCompareAvailability(trainer);
      syncControls();
      return;
    }
    requestAnimationFrame(() => compareLoop(token,runToken));
  } catch (error) {
    cancelComparison();
    syncControls();
    ui.showError(`So sánh đã dừng: ${error.message}`);
  }
}

function startComparison() {
  if (!trainer?.hasComparisonData() || session.comparing) return;
  try {
    compareRun = new ComparisonRun({netSizes:trainer.netSizes,envFactory:trainer.envFactory,
      envOptions:trainer.envOptions,beforeGenes:trainer.gen1BestGenes,afterGenes:trainer.currentBestGenes,
      maxTicks:trainer.maxStepsPerGen});
    session.comparing = true;
    const token = ++compareId;
    const runToken = session.runId;
    ui.setComparing(true);
    syncControls();
    requestAnimationFrame(() => compareLoop(token,runToken));
  } catch(error) {ui.showError(error.message);}
}

ui.el.btnStart.addEventListener('click', () => {
  ui.showError(null);
  if (session.state === 'paused') {
    session.resume();
    syncControls();
    return;
  }
  if (session.state === 'running' || session.comparing) return;
  try {
    const s = ui.readSettings();
    const next = createTrainer(s); // Hoàn tất validation trước khi thay phiên đang hiển thị.
    cancelComparison();
    trainer = next;
    lastSettings = s;
    session.start(s);
    ui.hideSummary();
    ui.setGameMeta(resolveEnv(s).envConfig);
    ui.drawChart([]);
    ui.drawScoreChart([]);
    ui.clearCompare();
    ui.clearMilestones();
    ui.clearRankTable();
    ui.drawHeatmap(null,null,null);
    ui.drawFitnessHistogram([],0);
    syncControls();
  } catch (error) {ui.showError(error.message);}
});

ui.el.btnPause.addEventListener('click', () => {
  if (session.state !== 'running') return;
  session.pause();
  cancelComparison();
  syncControls();
});
ui.el.btnStop.addEventListener('click', () => {
  if (['running','paused'].includes(session.state)) finishRun('manual');
  else if (session.comparing) {cancelComparison(); syncControls();}
});
ui.el.btnRunCompare.addEventListener('click',startComparison);
ui.el.btnReset.addEventListener('click', () => {
  cancelComparison();
  session.reset();
  trainer = null;
  lastSettings = null;
  ui.hideSummary();
  ui.showError(null);
  ui.updateStats({generation:0,alive:0,best:0,bestEver:0,score:0,scoreEver:0});
  ui.drawChart([]);
  ui.drawScoreChart([]);
  ui.clearRankTable();
  ui.clearCompare();
  ui.clearMilestones();
  ui.drawHeatmap(null,null,null);
  ui.drawFitnessHistogram([],0);
  ui.refreshResumeInfo();
  syncControls();
});
ui.el.btnSummaryClose.addEventListener('click', () => ui.hideSummary());
ui.el.summaryOverlay.addEventListener('click', e => {if(e.target === ui.el.summaryOverlay) ui.hideSummary();});

syncControls();
ui.drawChart([]);
ui.drawScoreChart([]);
ui.clearCompare();
ui.drawHeatmap(null,null,null);
ui.drawFitnessHistogram([],0);
requestAnimationFrame(loop);
