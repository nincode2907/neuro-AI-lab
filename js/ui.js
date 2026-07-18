/**
 * ui.js — Gom mọi thao tác DOM + vẽ biểu đồ. DÙNG CHUNG cho mọi game.
 *
 * File này không chứa logic học — chỉ đọc/ghi các control và hiển thị
 * số liệu mà main.js/Trainer đưa sang.
 */

import { registry } from './environments/registry.js';

export class UI {
  constructor() {
    // --- Tra cứu các element một lần ---
    this.el = {
      gameSelect: document.getElementById('game-select'),
      popSize: document.getElementById('pop-size'),
      mutationRate: document.getElementById('mutation-rate'),
      mutationRateLabel: document.getElementById('mutation-rate-label'),
      hiddenNodes: document.getElementById('hidden-nodes'),
      targetScore: document.getElementById('target-score'),
      gameHint: document.getElementById('game-hint'),
      xiangqiSettings: document.getElementById('xiangqi-settings'),
      evalDepth: document.getElementById('eval-depth'),
      startLevel: document.getElementById('start-level'),
      simSpeed: document.getElementById('sim-speed'),
      simSpeedLabel: document.getElementById('sim-speed-label'),
      bestOnly: document.getElementById('best-only'),
      preRun: document.getElementById('pre-run-settings'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      btnReset: document.getElementById('btn-reset'),
      statGen: document.getElementById('stat-gen'),
      statAlive: document.getElementById('stat-alive'),
      statBest: document.getElementById('stat-best'),
      statBestEver: document.getElementById('stat-best-ever'),
      statScore: document.getElementById('stat-score'),
      statScoreEver: document.getElementById('stat-score-ever'),
      statScoreLabel: document.getElementById('stat-score-label'),
      statScoreEverLabel: document.getElementById('stat-score-ever-label'),
      scoreChartTitle: document.getElementById('score-chart-title'),
      chart: document.getElementById('chart-canvas'),
      scoreChart: document.getElementById('score-chart-canvas'),
      netCanvas: document.getElementById('net-canvas'),
      summaryOverlay: document.getElementById('summary-overlay'),
      summaryTitle: document.getElementById('summary-title'),
      summaryBody: document.getElementById('summary-body'),
      btnSummaryClose: document.getElementById('btn-summary-close'),
    };
    this.chartCtx = this.el.chart.getContext('2d');
    this.scoreChartCtx = this.el.scoreChart.getContext('2d');
    this.netCtx = this.el.netCanvas.getContext('2d');
    this.gameConfig = null; // metadata game đang chạy (nhãn score, nhãn input/output)

    // --- Dropdown game tự sinh từ registry ---
    for (const [key, entry] of Object.entries(registry)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = entry.config.name;
      this.el.gameSelect.appendChild(opt);
    }

    // --- Cập nhật nhãn slider realtime ---
    this.el.mutationRate.addEventListener('input', () => {
      this.el.mutationRateLabel.textContent = Number(this.el.mutationRate.value).toFixed(2);
    });
    this.el.simSpeed.addEventListener('input', () => {
      this.el.simSpeedLabel.textContent = 'x' + this.el.simSpeed.value;
    });

    // --- Đổi game: hiện/ẩn thông số riêng + đề xuất số phù hợp ---
    this.el.gameSelect.addEventListener('change', () => this._onGameChange());
    this._onGameChange(); // chạy 1 lần lúc khởi tạo cho đúng trạng thái ban đầu
  }

  /**
   * Cờ Tướng nặng hơn Flappy/Snake rất nhiều (mỗi ván = cả trận minimax), nên
   * khi chọn nó ta hiện thông số riêng và ĐỀ XUẤT giảm quần thể + tăng node ẩn.
   */
  _onGameChange() {
    const isXiangqi = this.el.gameSelect.value === 'xiangqi';
    this.el.xiangqiSettings.style.display = isXiangqi ? 'block' : 'none';
    if (isXiangqi) {
      // Đề xuất: quần thể nhỏ (mỗi cá thể phải chơi cả ván cờ) + não to hơn chút.
      this.el.popSize.value = 30;
      this.el.hiddenNodes.value = 12;
      this.el.simSpeed.value = 1;
      this.el.simSpeedLabel.textContent = 'x1';
      this.el.gameHint.textContent =
        '♟ Cờ Tướng chậm (~1 giây/thế hệ). Đề xuất: quần thể 20–40, để tốc độ x1. ' +
        'Mỗi cá thể là AI cầm Đỏ, dùng minimax + mạng nơ-ron của mình để đánh giá thế cờ, ' +
        'leo thang đấu bot từ cấp thấp lên.';
    } else {
      this.el.popSize.value = 100;
      this.el.hiddenNodes.value = 8;
      this.el.gameHint.textContent = '';
    }
  }

  /** Đọc thông số người dùng đã chọn (gọi lúc Start). */
  readSettings() {
    const target = Number(this.el.targetScore.value);
    return {
      gameKey: this.el.gameSelect.value,
      popSize: Math.max(10, Number(this.el.popSize.value) || 100),
      mutationRate: Number(this.el.mutationRate.value),
      hiddenNodes: Math.max(2, Number(this.el.hiddenNodes.value) || 8),
      // Điểm mục tiêu: > 0 thì bật, để trống/0 thì chạy vô hạn như trước
      targetScore: target > 0 ? target : null,
      // Thông số riêng Cờ Tướng (game khác bỏ qua trong envOptions)
      evalDepth: Math.max(1, Math.min(2, Number(this.el.evalDepth.value) || 1)),
      startLevel: Math.max(1, Math.min(7, Number(this.el.startLevel.value) || 1)),
    };
  }

  /** Tốc độ mô phỏng hiện tại (số tick vật lý mỗi frame vẽ). */
  getSpeed() {
    return Number(this.el.simSpeed.value);
  }

  /** Có đang bật "chỉ hiện con giỏi nhất" không. */
  isBestOnly() {
    return this.el.bestOnly.checked;
  }

  /**
   * Khoá/mở thông số pre-run + đổi trạng thái nút theo running/paused.
   * Điểm mới: KHI ĐANG PAUSE, nút Pause biến thành nút "■ Stop" (đỏ) —
   * bấm nó sẽ kết thúc & tổng kết quá trình (logic ở main.js).
   */
  setRunningState(running, paused = false) {
    this.el.preRun.disabled = running;
    this.el.gameSelect.disabled = running;
    this.el.btnStart.disabled = running && !paused;
    this.el.btnStart.textContent = paused ? '▶ Resume' : '▶ Start';

    // Nút Pause chỉ tắt khi hoàn toàn không chạy
    this.el.btnPause.disabled = !running;
    if (paused) {
      this.el.btnPause.textContent = '■ Stop';
      this.el.btnPause.classList.add('danger');
    } else {
      this.el.btnPause.textContent = '⏸ Pause';
      this.el.btnPause.classList.remove('danger');
    }
  }

  /**
   * Nhận metadata của game vừa chọn (gọi lúc Start) — đổi các nhãn score
   * cho đúng ngôn ngữ của game: "Ống vượt qua" / "Mồi đã ăn"...
   */
  setGameMeta(config) {
    this.gameConfig = config;
    const label = config.scoreLabel || 'Score';
    this.el.statScoreLabel.textContent = `${label} (thế hệ này)`;
    this.el.statScoreEverLabel.textContent = `${label} best-ever`;
    this.el.scoreChartTitle.textContent = `${label} theo thế hệ`;
  }

  /** Cập nhật bảng thống kê. */
  updateStats({ generation, alive, best, bestEver, score = 0, scoreEver = 0 }) {
    this.el.statGen.textContent = generation;
    this.el.statAlive.textContent = alive;
    this.el.statBest.textContent = Math.round(best);
    this.el.statBestEver.textContent = Math.round(bestEver);
    this.el.statScore.textContent = score;
    this.el.statScoreEver.textContent = scoreEver;
  }

  /**
   * Vẽ biểu đồ đường fitness theo thế hệ (tự vẽ trên canvas, không thư viện).
   * 2 đường: best (xanh) và avg (cam). Gọi sau mỗi lần evolve().
   * @param {{gen:number, best:number, avg:number}[]} history
   */
  drawChart(history) {
    const ctx = this.chartCtx;
    const Wc = this.el.chart.width;
    const Hc = this.el.chart.height;
    const pad = { left: 44, right: 10, top: 10, bottom: 22 };
    const plotW = Wc - pad.left - pad.right;
    const plotH = Hc - pad.top - pad.bottom;

    ctx.clearRect(0, 0, Wc, Hc);

    // Chưa có dữ liệu -> hiện gợi ý
    if (history.length === 0) {
      ctx.fillStyle = '#8b96ad';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có dữ liệu — hoàn thành thế hệ đầu tiên…', Wc / 2, Hc / 2);
      return;
    }

    // --- Thang đo tự co giãn theo giá trị lớn nhất ---
    let maxY = 1;
    for (const h of history) maxY = Math.max(maxY, h.best);
    maxY *= 1.08; // chừa lề trên một chút
    const maxGen = Math.max(history.length, 2);

    const xOf = (i) => pad.left + (i / (maxGen - 1)) * plotW;
    const yOf = (v) => pad.top + plotH - (v / maxY) * plotH;

    // --- Lưới + nhãn trục Y (4 vạch) ---
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = '#8b96ad';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = (maxY / 4) * i;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(Wc - pad.right, y);
      ctx.stroke();
      ctx.fillText(Math.round(v), pad.left - 6, y + 3);
    }

    // --- Nhãn trục X: thế hệ đầu và cuối ---
    ctx.textAlign = 'center';
    ctx.fillText('1', xOf(0), Hc - 6);
    ctx.fillText(String(history[history.length - 1].gen), xOf(history.length - 1), Hc - 6);

    // --- Hàm vẽ 1 đường ---
    const drawLine = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((h, i) => {
        const x = xOf(i);
        const y = yOf(h[key]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      // chấm tròn ở điểm cuối cho dễ theo dõi
      const last = history[history.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xOf(history.length - 1), yOf(last[key]), 3, 0, Math.PI * 2);
      ctx.fill();
    };

    drawLine('avg', '#ffb74d');   // trung bình — cam
    drawLine('best', '#4fc3f7');  // cao nhất — xanh
  }

  /**
   * Biểu đồ score game (số ống / số mồi) theo thế hệ — đường xanh lá.
   * Với Snake, so sánh với biểu đồ fitness sẽ thấy rõ 2 giai đoạn học:
   * fitness tăng trước (học sống sót), score bật lên sau (học săn mồi).
   */
  drawScoreChart(history) {
    const ctx = this.scoreChartCtx;
    const Wc = this.el.scoreChart.width;
    const Hc = this.el.scoreChart.height;
    const pad = { left: 44, right: 10, top: 8, bottom: 20 };
    const plotW = Wc - pad.left - pad.right;
    const plotH = Hc - pad.top - pad.bottom;

    ctx.clearRect(0, 0, Wc, Hc);
    if (history.length === 0) {
      ctx.fillStyle = '#8b96ad';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có dữ liệu…', Wc / 2, Hc / 2);
      return;
    }

    let maxY = 1;
    for (const h of history) maxY = Math.max(maxY, h.score || 0);
    maxY *= 1.15;
    const maxGen = Math.max(history.length, 2);
    const xOf = (i) => pad.left + (i / (maxGen - 1)) * plotW;
    const yOf = (v) => pad.top + plotH - (v / maxY) * plotH;

    // Lưới ngang + nhãn Y
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = '#8b96ad';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const v = (maxY / 3) * i;
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(Wc - pad.right, y); ctx.stroke();
      ctx.fillText(Math.round(v), pad.left - 6, y + 3);
    }
    ctx.textAlign = 'center';
    ctx.fillText('1', xOf(0), Hc - 5);
    ctx.fillText(String(history[history.length - 1].gen), xOf(history.length - 1), Hc - 5);

    // Đường score
    ctx.strokeStyle = '#66bb6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((h, i) => {
      const x = xOf(i);
      const y = yOf(h.score || 0);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = history[history.length - 1];
    ctx.fillStyle = '#66bb6a';
    ctx.beginPath();
    ctx.arc(xOf(history.length - 1), yOf(last.score || 0), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Vẽ mạng nơ-ron của con giỏi nhất ĐANG suy nghĩ:
   *  - Mỗi cột = 1 lớp (inputs -> ẩn -> outputs), có nhãn từ config game.
   *  - Dây nối: xanh = trọng số dương, đỏ = âm; càng đậm/dày = càng mạnh.
   *  - Node: càng sáng = giá trị kích hoạt càng cao ngay tick này.
   * Nhìn node input nào sáng + dây nào đậm là đoán được "nó đang chú ý gì".
   * @param {NeuralNetwork|null} net — mạng của con giỏi nhất (null nếu chưa chạy)
   */
  drawNetwork(net) {
    const ctx = this.netCtx;
    const Wc = this.el.netCanvas.width;
    const Hc = this.el.netCanvas.height;
    ctx.clearRect(0, 0, Wc, Hc);

    if (!net || !net.activations) {
      ctx.fillStyle = '#8b96ad';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bấm Start để xem bộ não hoạt động…', Wc / 2, Hc / 2);
      return;
    }

    const inLabels = this.gameConfig?.inputLabels || [];
    const outLabels = this.gameConfig?.outputLabels || [];
    const layers = net.sizes;                 // vd [10, 8, 3]
    const acts = net.activations;             // giá trị kích hoạt từng lớp
    const padL = 92, padR = 76, padV = 14;    // chừa chỗ 2 bên cho nhãn
    const layerX = (l) => padL + (l / (layers.length - 1)) * (Wc - padL - padR);
    const nodeY = (l, i) => {
      const n = layers[l];
      return padV + ((i + 0.5) / n) * (Hc - 2 * padV);
    };
    // Chuẩn hoá kích hoạt về 0..1 để tô độ sáng (lớp ẩn dùng tanh -1..1)
    const norm = (l, v) => (l > 0 && l < layers.length - 1) ? (v + 1) / 2 : Math.max(0, Math.min(1, v));

    // --- Dây nối (vẽ trước để node đè lên) ---
    for (let l = 0; l < net.weights.length; l++) {
      const rows = layers[l + 1];
      const cols = layers[l];
      const w = net.weights[l];
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const wt = w[i * cols + j];
          const mag = Math.min(1, Math.abs(wt) / 1.5);
          if (mag < 0.06) continue; // bỏ dây quá yếu cho đỡ rối
          ctx.strokeStyle = wt > 0
            ? `rgba(79, 195, 247, ${0.12 + mag * 0.55})`
            : `rgba(239, 83, 80, ${0.12 + mag * 0.55})`;
          ctx.lineWidth = 0.5 + mag * 2;
          ctx.beginPath();
          ctx.moveTo(layerX(l), nodeY(l, j));
          ctx.lineTo(layerX(l + 1), nodeY(l + 1, i));
          ctx.stroke();
        }
      }
    }

    // --- Node + nhãn ---
    ctx.font = '10px sans-serif';
    for (let l = 0; l < layers.length; l++) {
      for (let i = 0; i < layers[l]; i++) {
        const x = layerX(l);
        const y = nodeY(l, i);
        const a = norm(l, acts[l] ? acts[l][i] : 0);

        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(79, 195, 247, ${0.15 + a * 0.85})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (l === 0 && inLabels[i]) {
          ctx.fillStyle = '#8b96ad';
          ctx.textAlign = 'right';
          ctx.fillText(inLabels[i], x - 12, y + 3);
        } else if (l === layers.length - 1) {
          // Nhãn output kèm giá trị — thấy ngay lúc nào nó "quyết định"
          ctx.fillStyle = acts[l] && acts[l][i] > 0.5 ? '#aee571' : '#8b96ad';
          ctx.textAlign = 'left';
          const v = acts[l] ? acts[l][i].toFixed(2) : '?';
          ctx.fillText(`${outLabels[i] || 'out' + i} ${v}`, x + 12, y + 3);
        }
      }
    }
  }

  /**
   * Hiện modal tổng kết + đề xuất chỉ số (dữ liệu từ analysis.js).
   * @param {object} a — kết quả analyzeRun()
   */
  showSummary(a) {
    const reasonText = a.reason === 'target'
      ? '🎯 Đã đạt điểm mục tiêu'
      : '■ Đã dừng thủ công';
    this.el.summaryTitle.textContent = `Tổng kết — ${reasonText}`;

    const suggestionsHTML = a.suggestions.map((s) => `
      <div class="suggestion">
        <div class="s-title">${s.title}</div>
        <div class="s-detail">${s.detail}</div>
      </div>`).join('');

    this.el.summaryBody.innerHTML = `
      <div class="summary-stats">
        <div class="stat"><span class="stat-label">Thế hệ đã chạy</span><span class="stat-value">${a.generations}</span></div>
        <div class="stat"><span class="stat-label">Fitness best-ever</span><span class="stat-value accent">${a.bestFitness}</span></div>
        <div class="stat"><span class="stat-label">${a.scoreLabel} best-ever</span><span class="stat-value green">${a.bestScore}</span></div>
      </div>
      <div class="summary-trend">${a.trendText}</div>
      <div class="summary-section-title">Đề xuất thay đổi chỉ số cho lần sau</div>
      ${suggestionsHTML}
    `;

    this.el.summaryOverlay.classList.remove('hidden');
  }

  hideSummary() {
    this.el.summaryOverlay.classList.add('hidden');
  }
}
