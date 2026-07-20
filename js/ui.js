/**
 * ui.js — Gom mọi thao tác DOM + vẽ biểu đồ. DÙNG CHUNG cho mọi game.
 *
 * File này không chứa logic học — chỉ đọc/ghi các control và hiển thị
 * số liệu mà main.js/Trainer đưa sang.
 */

import { registry } from './environments/registry.js';
import { loadHistory, loadHistoryEntry, deleteHistoryEntry } from './storage.js';
import { STRATEGY_FEATURES } from './environments/2048.js';
import { computeHeatmapGrid } from './heatmap.js';
import { NeuralNetwork } from './nn.js';

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
      resumeRow: document.getElementById('resume-row'),
      initMode: document.getElementById('init-mode'),
      historyPanel: document.getElementById('history-panel'),
      historyList: document.getElementById('history-list'),
      btnClearSaved: document.getElementById('btn-clear-saved'),
      xiangqiSettings: document.getElementById('xiangqi-settings'),
      evalDepth: document.getElementById('eval-depth'),
      startLevel: document.getElementById('start-level'),
      flappySettings: document.getElementById('flappy-settings'),
      lookahead: document.getElementById('lookahead'),
      seedsPerGen: document.getElementById('seeds-per-gen'),
      game2048Settings: document.getElementById('game2048-settings'),
      searchDepth: document.getElementById('search-depth'),
      // Checkbox mẹo chiến thuật 2048 — key phải khớp STRATEGY_FEATURES (2048.js)
      strategyChecks: {
        corner: document.getElementById('strat-corner'),
        mono: document.getElementById('strat-mono'),
        occupancy: document.getElementById('strat-occupancy'),
        merges: document.getElementById('strat-merges'),
      },
      heatmapCard: document.getElementById('heatmap-card'),
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
      rankTableBody: document.getElementById('rank-table-body'),
      rankScoreLabel: document.getElementById('rank-score-label'),
      rankStatusLabel: document.getElementById('rank-status-label'),
      metricTooltip: document.getElementById('metric-tooltip'),
      metricTooltipTitle: document.getElementById('metric-tooltip-title'),
      metricTooltipBody: document.getElementById('metric-tooltip-body'),
      summaryOverlay: document.getElementById('summary-overlay'),
      summaryTitle: document.getElementById('summary-title'),
      summaryBody: document.getElementById('summary-body'),
      btnSummaryClose: document.getElementById('btn-summary-close'),
      compareBeforeCanvas: document.getElementById('compare-before-canvas'),
      compareAfterCanvas: document.getElementById('compare-after-canvas'),
      compareBeforeTitle: document.getElementById('compare-before-title'),
      compareAfterTitle: document.getElementById('compare-after-title'),
      compareBeforeStatus: document.getElementById('compare-before-status'),
      compareAfterStatus: document.getElementById('compare-after-status'),
      btnRunCompare: document.getElementById('btn-run-compare'),
      compareHint: document.getElementById('compare-hint'),
      milestoneList: document.getElementById('milestone-list'),
      heatmapCanvas: document.getElementById('heatmap-canvas'),
      heatmapLegendNo: document.getElementById('heatmap-legend-no'),
      heatmapLegendYes: document.getElementById('heatmap-legend-yes'),
      histogramCanvas: document.getElementById('histogram-canvas'),
    };
    this.chartCtx = this.el.chart.getContext('2d');
    this.scoreChartCtx = this.el.scoreChart.getContext('2d');
    this.netCtx = this.el.netCanvas.getContext('2d');
    this.compareBeforeCtx = this.el.compareBeforeCanvas.getContext('2d');
    this.compareAfterCtx = this.el.compareAfterCanvas.getContext('2d');
    this.heatmapCtx = this.el.heatmapCanvas.getContext('2d');
    this.histogramCtx = this.el.histogramCanvas.getContext('2d');
    this._lastRankKey = ''; // dấu vân tay của bảng xếp hạng lần vẽ trước — chỉ vẽ lại khi đổi
    this._jumpGeneCount = null; // số gen lớp output hiện tại (= hiddenNodes + 1) — để giải thích từng vị trí
    this._lastMilestoneCount = 0; // milestones chỉ APPEND nên so độ dài là đủ, khỏi vẽ lại thừa
    this._comparing = false; // đang chạy "Trước vs Sau" hay không
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

    // --- Chọn "tiếp tục" tự đồng bộ node ẩn theo gen đã lưu (kiến trúc mạng
    // phải khớp thì mới nạp gen được — xem ga.js: NeuralNetwork.fromGenes) ---
    this.el.initMode.addEventListener('change', () => this._onInitModeChange());
    // Đổi mục lịch sử đang chọn → khoá lại thông số theo đúng mục đó.
    this.el.historyList.addEventListener('change', () => this._onInitModeChange());
    this.el.btnClearSaved.addEventListener('click', () => {
      const id = this._selectedHistoryId();
      if (id) deleteHistoryEntry(this.el.gameSelect.value, id);
      this._updateResumeUI();
    });

    // --- Popover giải thích cột bảng xếp hạng: bấm nút "?" nào hiện đúng nội
    // dung cột đó, bấm lần nữa (hoặc bấm ra ngoài) thì đóng lại. ---
    document.addEventListener('click', (e) => this._onDocumentClickForTooltip(e));
  }

  /** Nội dung giải thích cho từng cột của bảng xếp hạng top 20 (nút "?"). */
  static METRIC_HELP = {
    rank: {
      title: 'Hạng',
      body: 'Thứ tự xếp hạng theo fitness (tổng reward tích luỹ) giảm dần NGAY '
        + 'LÚC NÀY — đổi liên tục trong lúc quần thể đang chơi vì fitness của '
        + 'từng con tăng dần mỗi tick còn sống. Cuối thế hệ, thứ hạng này quyết '
        + 'định ai được giữ nguyên làm "elite", ai được ưu tiên làm cha/mẹ lai '
        + 'ghép (xem docs/flappy.md mục 6).',
    },
    status: {
      title: 'Trạng thái',
      body: 'Nút xanh BẬT = còn sống, vẫn đang chơi, fitness còn có thể tăng '
        + 'thêm ở tick sau. Nút TẮT (xám) = đã chết — va chạm/thua từ tick nào '
        + 'đó trong thế hệ này, fitness đã chốt, chỉ còn chờ cả quần thể chết '
        + 'hết để evolve() sang thế hệ mới.',
    },
    score: {
      title: 'Score (kỉ lục cũ → hiện tại)',
      body: 'Số đứng trước là "kỉ lục" gen này từng đạt ở THẾ HỆ TRƯỚC (elite: '
        + 'chính nó; lai ghép/đột biến: record cao hơn trong 2 cha mẹ nó thừa '
        + 'hưởng gen). Trong ngoặc là gen này đang chơi LIVE thế hệ này thay đổi '
        + 'bao nhiêu so với kỉ lục đó — ▲ xanh = đang vượt kỉ lục cũ, ▼ đỏ = '
        + 'đang thua kỉ lục cũ, số càng lớn càng lệch nhiều. "—" = chưa có thế '
        + 'hệ trước để tra (thế hệ đầu tiên), khi đó chỉ hiện score live.',
    },
    geneType: {
      title: 'Loại gen',
      body: '"Ngẫu nhiên": não hoàn toàn random, chỉ có ở thế hệ đầu tiên. '
        + '"Elite": sao chép NGUYÊN VẸN 1 trong vài con giỏi nhất thế hệ trước, '
        + 'không lai ghép/đột biến gì. "Lai ghép": gen trộn 50/50 từ 2 cha mẹ '
        + '(uniform crossover) nhưng KHÔNG có gen nào bị đột biến thêm. "Đột '
        + 'biến": lai ghép xong còn bị cộng nhiễu ngẫu nhiên vào ít nhất 1 gen '
        + '(ở bất kỳ lớp nào, không chỉ lớp output) — xem docs/flappy.md mục 6.',
    },
    jumpGeneDetail: {
      title: 'Chi tiết tham số nhảy',
      body: 'Toàn bộ gen ở LỚP OUTPUT của mạng — trọng số + bias biến kích hoạt '
        + 'lớp ẩn thành xác suất nhảy cuối cùng (outputs[0] > 0.5 thì vỗ cánh). '
        + 'Elite (sao chép nguyên vẹn từ thế hệ trước) hiện màu trắng — đây là '
        + 'mốc tham chiếu "top 1". Các con còn lại tô màu TỪNG gen so với gen '
        + 'tương ứng của top 1: xanh lá = giá trị cao hơn, đỏ = thấp hơn. Nhìn '
        + 'nhiều đỏ/xanh cùng lúc nghĩa là "công thức nhảy" của con này đã lệch '
        + 'khá xa con giỏi nhất — xem docs/flappy.md mục 3 & 6.4.',
    },
    jumpGenes: {
      title: 'Số gen đổi',
      body: 'Trong các gen ở cột "Chi tiết tham số nhảy", có bao nhiêu gen vừa '
        + 'bị ĐỘT BIẾN so với thế hệ trước (vd "2/9" = 2 trên tổng 9 gen). 0 '
        + 'nghĩa là "elite" (giữ nguyên) hoặc chỉ lai ghép không đột biến. Số '
        + 'càng cao thì cách con này phản xạ "nhảy hay không" càng có nhiều thay '
        + 'đổi mới (chưa chắc tốt hơn hay tệ hơn, chỉ là khác) so với thế hệ '
        + 'trước — xem docs/flappy.md mục 6.4.',
    },
  };

  /** Toggle popover giải thích khi bấm nút "?", đóng khi bấm ra ngoài popover. */
  _onDocumentClickForTooltip(e) {
    const qmark = e.target.closest('.qmark');
    const tooltip = this.el.metricTooltip;
    const clickedInsideTooltip = tooltip.contains(e.target);

    if (!qmark) {
      if (!clickedInsideTooltip) tooltip.classList.add('hidden');
      return;
    }

    const key = qmark.dataset.help;
    const alreadyOpenForThis = !tooltip.classList.contains('hidden') && tooltip.dataset.openFor === key;
    if (alreadyOpenForThis) {
      tooltip.classList.add('hidden');
      return;
    }

    const info = UI.METRIC_HELP[key];
    if (!info) return;
    this.el.metricTooltipTitle.textContent = info.title;
    // Cột "Chi tiết tham số nhảy" có thêm đoạn giải thích Ý NGHĨA TỪNG VỊ TRÍ
    // trong dãy N số — phụ thuộc hiddenNodes hiện tại nên phải build động,
    // không thể để tĩnh trong METRIC_HELP như các cột khác.
    this.el.metricTooltipBody.textContent = key === 'jumpGeneDetail'
      ? `${info.body}\n\n${this._describeJumpGenePositions()}`
      : info.body;
    tooltip.dataset.openFor = key;
    tooltip.classList.remove('hidden');

    // Định vị popover ngay dưới nút "?" vừa bấm, kẹp trong khung nhìn.
    const r = qmark.getBoundingClientRect();
    tooltip.style.top = `${Math.round(r.bottom + 6)}px`;
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 12;
    tooltip.style.left = `${Math.round(Math.min(Math.max(12, r.left), maxLeft))}px`;
  }

  /**
   * Giải thích Ý NGHĨA TỪNG VỊ TRÍ trong dãy N số của cột "Chi tiết tham số
   * nhảy" — vd với 8 node ẩn thì N=9: gen #1–#8 tương ứng trọng số của từng
   * node ẩn, gen #9 là bias. Đúng theo thứ tự NeuralNetwork.getGenes() (xem
   * ga.js: _outputGeneRange). Số node ẩn có thể đổi tuỳ người dùng nên phải
   * build động theo `_jumpGeneCount` (cập nhật mỗi lần updateRankTable chạy).
   */
  _describeJumpGenePositions() {
    const n = this._jumpGeneCount;
    if (!n) return 'Bấm Start để xem đúng số gen (phụ thuộc số node lớp ẩn đang chọn).';
    const hidden = n - 1;
    return `Thứ tự từng số trong dãy ${n} gen hiện tại (${hidden} node ẩn ⇒ ${hidden} trọng số + 1 bias): `
      + `gen #1–#${hidden} lần lượt là trọng số nối kích hoạt của node ẩn thứ 1→${hidden} `
      + `tới neuron output (nhân với giá trị tanh của node ẩn đó rồi cộng dồn); `
      + `gen #${n} (số cuối cùng) là bias cộng thêm vào tổng đó trước khi qua sigmoid `
      + `ra xác suất nhảy.`;
  }

  /** Sai số tối thiểu để coi 1 gen là "cao hơn/thấp hơn" top 1 — tránh tô màu
   * vì chênh lệch nhiễu số học vặt vãnh (vd 1.4000001 vs 1.4). */
  static GENE_DIFF_EPS = 0.02;

  /**
   * Vẽ cột "Chi tiết tham số nhảy" của 1 cá thể: mỗi gen lớp output là 1 số
   * nhỏ, elite hiện màu trắng (mốc tham chiếu), còn lại tô xanh lá (cao hơn
   * top 1) / đỏ (thấp hơn top 1) / xám (bằng top 1) TỪNG gen một.
   * @param {{isElite:boolean, jumpGeneValues:number[]}} ind
   * @param {number[]} refValues — gen của cá thể #1 hiện tại (mốc so sánh)
   */
  _renderGeneValues(ind, refValues) {
    const eps = UI.GENE_DIFF_EPS;
    const spans = ind.jumpGeneValues.map((v, gi) => {
      const text = v.toFixed(1);
      if (ind.isElite) return `<span class="gv-plain">${text}</span>`;
      const refV = refValues[gi];
      let cls = 'gv-same';
      if (refV !== undefined) {
        const diff = v - refV;
        if (diff > eps) cls = 'gv-up';
        else if (diff < -eps) cls = 'gv-down';
      }
      return `<span class="${cls}">${text}</span>`;
    }).join('');
    return `<div class="gene-values">${spans}</div>`;
  }

  /** Nhãn + màu badge cho từng "loại gen" (xem ga.js: ind.geneType). */
  static GENE_TYPE_BADGE = {
    random: { label: 'Ngẫu nhiên', cls: 'gt-random' },
    elite: { label: 'Elite', cls: 'gt-elite' },
    crossover: { label: 'Lai ghép', cls: 'gt-crossover' },
    mutated: { label: 'Đột biến', cls: 'gt-mutated' },
  };

  /** Nút bật/tắt nhỏ thể hiện trạng thái sống/chết (xanh = còn sống). */
  _renderStatusToggle(alive) {
    return `<span class="status-toggle ${alive ? 'on' : 'off'}" title="${alive ? 'Còn sống' : 'Đã chết'}">`
      + '<span class="knob"></span></span>';
  }

  /**
   * Vẽ cột Score: "kỉ lục cũ" (ind.sourceScore, xem ga.js) kèm mũi tên cho
   * biết score đang chơi LIVE thế hệ này đã đổi bao nhiêu so với kỉ lục đó —
   * ▲ xanh nếu vượt (live > cũ), ▼ đỏ nếu thua (live < cũ). Thế hệ đầu tiên
   * (sourceScore null, chưa có gì để so) chỉ hiện score live, không mũi tên.
   */
  _renderScoreCell(ind) {
    const live = ind.env.getScore ? ind.env.getScore() : 0;
    if (ind.sourceScore == null) return String(live);

    const delta = live - ind.sourceScore;
    if (delta === 0) return `${ind.sourceScore}`;
    const arrow = delta > 0 ? '▲' : '▼';
    const cls = delta > 0 ? 'score-up' : 'score-down';
    return `${ind.sourceScore} <span class="score-delta ${cls}">(${arrow}${Math.abs(delta)})</span>`;
  }

  /**
   * Vẽ lại bảng top N cá thể (mặc định N=20) — gọi mỗi frame từ main.js;
   * tự bỏ qua nếu thứ hạng/score/gen chưa đổi gì so với lần vẽ trước (so
   * bằng 1 chuỗi "dấu vân tay"), tránh thao tác DOM thừa ở 60fps. Cá thể đã
   * chết được vẽ mờ đi (class rank-dead) NGOÀI RA còn có nút trạng thái riêng.
   * @param {{fitness:number, alive:boolean, env:object, isElite:boolean,
   *          geneType:'random'|'elite'|'crossover'|'mutated',
   *          jumpGeneValues:number[], jumpGenesChanged:number|null,
   *          jumpGenesTotal:number}[]} topRanked — đã xếp hạng giảm dần
   * @param {string} scoreLabel — nhãn score riêng của game (vd "Ống vượt qua")
   * @param {number} [alive] — số cá thể CẢ QUẦN THỂ còn sống (không chỉ top 20)
   * @param {number} [popSize] — tổng quần thể — cùng `alive` vẽ "Status (20/50)"
   *   ở tiêu đề cột, khớp cách hiển thị của thẻ Thống kê (xem updateStats).
   */
  updateRankTable(topRanked, scoreLabel, alive, popSize) {
    this.el.rankScoreLabel.childNodes[0].textContent = `${scoreLabel} `;
    this.el.rankStatusLabel.childNodes[0].textContent =
      popSize ? `Status (${alive}/${popSize}) ` : 'Status ';
    if (topRanked.length) this._jumpGeneCount = topRanked[0].jumpGeneValues.length;

    // fitness + score live đều nằm trong "dấu vân tay" dù fitness không hiện
    // riêng — score live cần biết để phát hiện đổi (cột Score giờ so sánh
    // live vs kỉ lục cũ, thay đổi liên tục ngay trong lúc chơi).
    const key = topRanked.map((ind) => {
      const live = ind.env.getScore ? ind.env.getScore() : 0;
      return `${Math.round(ind.fitness)}|${live}|${ind.sourceScore}|${ind.alive ? 1 : 0}|${ind.jumpGenesChanged}|${ind.geneType}`;
    }).join(';');
    if (key === this._lastRankKey) return; // không gì đổi — khỏi vẽ lại
    this._lastRankKey = key;

    if (topRanked.length === 0) {
      this.el.rankTableBody.innerHTML = '<tr><td colspan="6" class="rank-empty">Bấm Start để xem bảng xếp hạng…</td></tr>';
      return;
    }

    const refValues = topRanked[0].jumpGeneValues; // mốc so sánh = cá thể #1 hiện tại

    this.el.rankTableBody.innerHTML = topRanked.map((ind, i) => {
      const score = this._renderScoreCell(ind);
      const changed = ind.jumpGenesChanged;
      const changedCell = changed == null
        ? '<span class="genes-na">—</span>'
        : `<span class="${changed > 0 ? 'genes-changed' : 'genes-same'}">${changed}/${ind.jumpGenesTotal}</span>`;
      const badge = UI.GENE_TYPE_BADGE[ind.geneType] || UI.GENE_TYPE_BADGE.crossover;
      return `
        <tr class="${ind.alive ? '' : 'rank-dead'}">
          <td>#${i + 1}</td>
          <td>${this._renderStatusToggle(ind.alive)}</td>
          <td>${score}</td>
          <td><span class="gene-type-badge ${badge.cls}">${badge.label}</span></td>
          <td>${this._renderGeneValues(ind, refValues)}</td>
          <td>${changedCell}</td>
        </tr>`;
    }).join('');
  }

  /** Về trạng thái chờ ban đầu (gọi lúc Reset). */
  clearRankTable() {
    this._lastRankKey = '';
    this._jumpGeneCount = null;
    this.el.rankTableBody.innerHTML = '<tr><td colspan="6" class="rank-empty">Bấm Start để xem bảng xếp hạng…</td></tr>';
  }

  /** Gọi lại từ main.js sau khi 1 lần chạy kết thúc (Stop/target) hoặc Reset,
   * vì dữ liệu đã lưu vừa có thể vừa được cập nhật (progress mới nhất). */
  refreshResumeInfo() {
    this._updateResumeUI();
  }

  /** id của mục lịch sử đang được tick, hoặc null. */
  _selectedHistoryId() {
    return this.el.historyList.querySelector('input[name="history-pick"]:checked')?.value || null;
  }

  /**
   * Mô tả ngắn gọn một bộ thông số kiến trúc thành các "chip" để người dùng
   * NHỚ RA mục lịch sử này là cấu hình nào — chỉ nêu thứ khác mặc định, tránh
   * biến mỗi dòng thành một bức tường chữ.
   * @param {object} arch — xem storage.js (archOf)
   * @returns {string[]}
   */
  _describeArch(arch, gameKey) {
    const tags = [`${arch.hiddenNodes} node ẩn`];
    if (gameKey === 'flappy' && arch.lookahead > 1) tags.push(`nhìn trước ${arch.lookahead} ống`);
    if (gameKey === '2048') {
      tags.push(arch.searchDepth >= 2 ? `expectimax ${arch.searchDepth} tầng` : 'policy thuần');
      if (arch.strategies?.length) {
        const labels = arch.strategies
          .map((k) => STRATEGY_FEATURES.find((f) => f.key === k)?.label)
          .filter(Boolean);
        if (labels.length) tags.push(`mẹo: ${labels.join(', ')}`);
      }
    }
    if (gameKey === 'xiangqi') {
      tags.push(`minimax ${arch.evalDepth} tầng`, `bot cấp ${arch.startLevel}`);
    }
    if (arch.seedsPerGen > 1) tags.push(`${arch.seedsPerGen} dàn/thế hệ`);
    return tags;
  }

  /**
   * Hiện/ẩn khối "Khởi tạo quần thể" + vẽ danh sách lịch sử của game đang
   * chọn (gọi mỗi khi đổi game, sau mỗi lần chạy, và lúc khởi tạo UI).
   */
  _updateResumeUI() {
    const gameKey = this.el.gameSelect.value;
    const history = loadHistory(gameKey);
    const hasSaved = history.length > 0;

    this.el.resumeRow.style.display = hasSaved ? 'flex' : 'none';
    if (!hasSaved) {
      this.el.initMode.value = 'fresh';
      this.el.historyPanel.style.display = 'none';
      this.el.historyList.innerHTML = '';
      this._onInitModeChange();
      return;
    }

    // Giữ nguyên mục đang chọn nếu nó vẫn còn sau khi lịch sử đổi (vd vừa lưu
    // đè), không thì rơi về mục giỏi nhất.
    const keep = this._selectedHistoryId();
    const picked = history.some((e) => e.id === keep) ? keep : history[0].id;
    const scoreLabel = (registry[gameKey]?.config.scoreLabel || 'Score').toLowerCase();

    this.el.historyList.innerHTML = history.map((e, i) => {
      const when = new Date(e.savedAt).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const tags = this._describeArch(e.arch, gameKey)
        .map((t) => `<i class="history-tag">${t}</i>`).join('');
      // popSize/mutationRate là thông số CHỈNH ĐƯỢC — hiện để gợi nhớ lần
      // trước chạy bằng gì, nhưng không khoá lại khi nạp.
      const tuned = e.popSize
        ? `N=${e.popSize} · đột biến ${Number(e.mutationRate).toFixed(2)}`
        : 'thông số cũ không rõ';
      return `
        <label class="history-item">
          <input type="radio" name="history-pick" value="${e.id}" ${e.id === picked ? 'checked' : ''} />
          <span class="history-body">
            <span class="history-head">
              <b class="history-rank">#${i + 1}</b>
              <b class="history-score">${e.bestScore} ${scoreLabel}</b>
              <span class="history-meta">thế hệ ${e.generation} · fitness ${Math.round(e.bestFitness)} · ${when}</span>
            </span>
            <span class="history-tags">${tags}<i class="history-tag tuned">${tuned}</i></span>
          </span>
        </label>`;
    }).join('');

    this._onInitModeChange();
  }

  /**
   * Khi chọn "Tiếp tục từ lịch sử", khoá & đồng bộ MỌI thông số của mục đang
   * chọn trừ `popSize`/`mutationRate`. Lý do khoá: hiddenNodes/lookahead/
   * searchDepth/strategies quyết định độ dài gen (đổi là hết nạp lại được gen
   * cũ), còn evalDepth/startLevel/seedsPerGen đổi luật chơi nên so kỉ lục sẽ
   * khập khiễng — xem storage.js (archOf).
   */
  _onInitModeChange() {
    const resuming = this.el.initMode.value === 'resume';
    this.el.historyPanel.style.display =
      resuming && this.el.historyList.children.length ? 'block' : 'none';

    const entry = resuming
      ? loadHistoryEntry(this.el.gameSelect.value, this._selectedHistoryId())
      : null;
    const lock = !!entry;
    const arch = entry?.arch;

    this.el.hiddenNodes.disabled = lock;
    this.el.lookahead.disabled = lock;
    this.el.searchDepth.disabled = lock;
    this.el.seedsPerGen.disabled = lock;
    this.el.evalDepth.disabled = lock;
    this.el.startLevel.disabled = lock;
    for (const el of Object.values(this.el.strategyChecks)) el.disabled = lock;

    if (!arch) return;
    this.el.hiddenNodes.value = arch.hiddenNodes;
    this.el.lookahead.value = arch.lookahead;
    this.el.searchDepth.value = arch.searchDepth;
    this.el.seedsPerGen.value = arch.seedsPerGen;
    this.el.evalDepth.value = arch.evalDepth;
    this.el.startLevel.value = arch.startLevel;
    for (const [key, el] of Object.entries(this.el.strategyChecks)) {
      el.checked = (arch.strategies || []).includes(key);
    }
  }

  /**
   * Cờ Tướng nặng hơn Flappy/Snake rất nhiều (mỗi ván = cả trận minimax), nên
   * khi chọn nó ta hiện thông số riêng và ĐỀ XUẤT giảm quần thể + tăng node ẩn.
   */
  _onGameChange() {
    const game = this.el.gameSelect.value;
    const isXiangqi = game === 'xiangqi';
    this.el.xiangqiSettings.style.display = isXiangqi ? 'block' : 'none';
    this.el.flappySettings.style.display = game === 'flappy' ? 'block' : 'none';
    this.el.game2048Settings.style.display = game === '2048' ? 'block' : 'none';

    // Heatmap quyết định chỉ có ý nghĩa với game quyết định NHỊ PHÂN trực tiếp
    // (khai báo heatmapAxes — hiện chỉ Flappy). Game khác ẩn hẳn card thay vì
    // hiện canvas trống + chữ "chưa hỗ trợ" chiếm chỗ vô ích.
    this.el.heatmapCard.style.display = registry[game]?.config.heatmapAxes ? 'block' : 'none';
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
    this._updateResumeUI();
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
      // Có chọn "Tiếp tục từ lịch sử" không, và nạp lại MỤC nào (xem storage.js)
      resume: this.el.initMode.value === 'resume',
      resumeId: this.el.initMode.value === 'resume' ? this._selectedHistoryId() : null,
      // Thông số riêng Cờ Tướng (game khác bỏ qua trong envOptions)
      evalDepth: Math.max(1, Math.min(2, Number(this.el.evalDepth.value) || 1)),
      startLevel: Math.max(1, Math.min(7, Number(this.el.startLevel.value) || 1)),
      // Thông số riêng Flappy: số ống nhìn trước (đổi số input của mạng)
      lookahead: Math.max(1, Math.min(3, Number(this.el.lookahead.value) || 1)),
      // Thông số riêng 2048: độ sâu expectimax (1 = policy thuần; ≥2 đổi mạng
      // thành hàm lượng giá 1 output — xem 2048.js configFor)
      searchDepth: Math.max(1, Math.min(3, Number(this.el.searchDepth.value) || 1)),
      // Thông số riêng 2048: mẹo chiến thuật đã tích — mỗi mẹo nối thêm 1 input
      strategies: Object.entries(this.el.strategyChecks)
        .filter(([, el]) => el.checked)
        .map(([key]) => key),
      // Thông số riêng Flappy: số dàn ống (seed) khác nhau chơi mỗi thế hệ,
      // fitness = trung bình cộng — xem ga.js (seedsPerGen)
      seedsPerGen: Math.max(1, Math.min(3, Number(this.el.seedsPerGen.value) || 1)),
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
  updateStats({ generation, alive, popSize, best, bestEver, score = 0, scoreEver = 0 }) {
    this.el.statGen.textContent = generation;
    // "20/50" — số cá thể còn sống trên tổng quần thể, không chỉ số sống trơ
    // trọi (dễ hiểu nhầm là tổng, nhất là lúc quần thể đã chết gần hết).
    this.el.statAlive.textContent = popSize ? `${alive}/${popSize}` : alive;
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

  /**
   * Bật/tắt nút "Chạy so sánh" tuỳ Trainer đã đủ dữ liệu chưa (xem
   * ga.js: hasComparisonData) + cập nhật nhãn "Thế hệ X" của 2 bên.
   * Gọi từ main.js sau mỗi evolve() (main.js không tự biết logic này —
   * đúng nguyên tắc "ui.js không chứa logic học nhưng có thể ĐỌC dữ liệu Trainer").
   */
  updateCompareAvailability(trainer) {
    const available = !!(trainer && trainer.hasComparisonData());
    this.el.btnRunCompare.disabled = !available || this._comparing;
    this.el.compareHint.textContent = available
      ? 'Mỗi lần bấm sẽ dùng dàn ống/map MỚI ngẫu nhiên (cùng seed cho cả 2 bên) để so sánh công bằng.'
      : 'Cần chạy ít nhất 2 thế hệ để có dữ liệu so sánh.';
    if (trainer && trainer.gen1BestGenesGen) {
      this.el.compareBeforeTitle.textContent = `Thế hệ ${trainer.gen1BestGenesGen}`;
      this.el.compareAfterTitle.textContent = `Thế hệ ${trainer.generation}`;
    }
  }

  /**
   * Đang chạy so sánh hay không — main.js gọi để khoá/mở nút. Chỉ gọi
   * setComparing(true) khi đã biết chắc hasComparisonData() (nút mới bấm
   * được), nên setComparing(false) LUÔN mở lại nút (không cần kiểm tra lại).
   */
  setComparing(comparing) {
    this._comparing = comparing;
    this.el.btnRunCompare.disabled = comparing;
    this.el.btnRunCompare.textContent = comparing ? '⏳ Đang chạy…' : '▶ Chạy lại (dàn ống mới)';
  }

  /**
   * Vẽ 1 khung hình của "Trước vs Sau": mỗi bên tự vẽ qua chính
   * env.render(ctx,'full') của game đó — dùng lại NGUYÊN logic vẽ chính,
   * không viết lại cho từng game (đúng kiến trúc dùng chung).
   * @param {import('./compare.js').ComparisonRun} cmp
   */
  renderCompareFrame(cmp) {
    const label = this.gameConfig?.scoreLabel || 'Score';
    this._renderCompareSide(this.compareBeforeCtx, cmp.before, this.el.compareBeforeStatus, label);
    this._renderCompareSide(this.compareAfterCtx, cmp.after, this.el.compareAfterStatus, label);
  }

  _renderCompareSide(ctx, side, statusEl, label) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    side.env.render(ctx, 'full');
    const score = side.env.getScore ? side.env.getScore() : 0;
    statusEl.textContent = side.done
      ? `${label}: ${score} — kết thúc (${side.ticks} tick)`
      : `${label}: ${score} — đang chơi… (${side.ticks} tick)`;
  }

  /** Xoá 2 canvas so sánh về trạng thái chờ (gọi lúc Reset). */
  clearCompare() {
    this._comparing = false;
    for (const ctx of [this.compareBeforeCtx, this.compareAfterCtx]) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = '#8b96ad';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có dữ liệu…', ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
    this.el.compareBeforeStatus.textContent = '—';
    this.el.compareAfterStatus.textContent = '—';
    this.el.compareBeforeTitle.textContent = 'Thế hệ 1';
    this.el.compareAfterTitle.textContent = 'Thế hệ hiện tại';
    this.el.btnRunCompare.disabled = true;
    this.el.btnRunCompare.textContent = '▶ Chạy so sánh';
    this.el.compareHint.textContent = 'Cần chạy ít nhất 2 thế hệ để có dữ liệu so sánh.';
  }

  /**
   * Vẽ danh sách "Cột mốc học được" — mới nhất lên đầu. Tự bỏ qua nếu số
   * lượng mốc chưa đổi (milestones chỉ APPEND nên so độ dài là đủ, khỏi cần
   * dấu vân tay như bảng xếp hạng).
   *
   * 2 loại mốc (xem ga.js: evolve()):
   *   'record'      — kỷ lục MỚI, chưa ai từng đạt điểm này.
   *   'consistency' — không phải kỷ lục mới, nhưng SỐ CÁ THỂ cùng đạt kỷ lục
   *                   hiện tại trong 1 thế hệ vừa lập đỉnh mới (đông hơn bất
   *                   kỳ thế hệ nào trước đó kể từ lúc lập kỷ lục đó) — tín
   *                   hiệu quần thể đang ổn định hoá kỹ năng, không phải may
   *                   mắn của riêng 1 cá thể.
   * @param {{gen:number, score:number, type?:string, count?:number}[]} milestones
   * @param {string} scoreLabel
   */
  updateMilestones(milestones, scoreLabel) {
    if (milestones.length === this._lastMilestoneCount) return;
    this._lastMilestoneCount = milestones.length;

    if (milestones.length === 0) {
      this.el.milestoneList.innerHTML = '<p class="hint">Chưa có cột mốc nào — đang chờ lần đầu ghi điểm…</p>';
      return;
    }

    this.el.milestoneList.innerHTML = milestones.slice().reverse().map((m, i) => {
      const text = m.type === 'consistency'
        ? `${m.count} cá thể cùng đạt ${m.score} ${scoreLabel}`
        : `lần đầu đạt ${m.score} ${scoreLabel}`;
      return `
      <div class="milestone-item ${i === 0 ? 'milestone-latest' : ''}">
        <span class="milestone-gen">Thế hệ ${m.gen}</span>
        <span class="milestone-arrow">→</span>
        <span class="milestone-score">${text}</span>
      </div>`;
    }).join('');
  }

  /** Về trạng thái chờ ban đầu (gọi lúc Reset). */
  clearMilestones() {
    this._lastMilestoneCount = 0;
    this.el.milestoneList.innerHTML = '<p class="hint">Chưa có cột mốc nào — đang chờ lần đầu ghi điểm…</p>';
  }

  /**
   * Vẽ "policy heatmap": quét lưới TOÀN BỘ tổ hợp giá trị 2 input được game
   * khai báo (xem heatmap.js + flappy.js: heatmapAxes), tô màu theo mạng SẼ
   * quyết định gì tại mỗi ô — xanh lá = làm hành động (vd "nhảy"), xanh dương
   * = không, càng đậm càng chắc chắn. Không cần chơi thật — cho thấy TOÀN BỘ
   * ranh giới quyết định tại 1 thời điểm, thay vì chỉ 1 quỹ đạo phụ thuộc may
   * rủi gặp tình huống nào. Thế hệ đầu: 2 màu loang lổ không theo quy luật rõ
   * (mạng random). Thế hệ sau: ranh giới liền mạch, sắc nét (mạng đã học).
   *
   * Dựng 1 mạng RIÊNG từ genes để hỏi — KHÔNG dùng mạng đang chơi thật, tránh
   * ghi đè net.activations mà drawNetwork() ("Bộ não realtime") đọc mỗi frame.
   * @param {number[]|null} netSizes — kiến trúc mạng [inputs, hidden, outputs]
   * @param {Float64Array|number[]|null} genes — gen của mạng muốn khảo sát
   *   (thường là Trainer.currentBestGenes — "con khôn nhất hiện tại")
   * @param {object|null} gameConfig — config game hiện tại (đọc heatmapAxes)
   */
  drawHeatmap(netSizes, genes, gameConfig) {
    const ctx = this.heatmapCtx;
    const Wc = this.el.heatmapCanvas.width;
    const Hc = this.el.heatmapCanvas.height;
    ctx.clearRect(0, 0, Wc, Hc);

    const axes = gameConfig?.heatmapAxes;
    if (!axes) {
      ctx.fillStyle = '#8b96ad';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Heatmap chỉ áp dụng cho game có quyết định nhị phân trực', Wc / 2, Hc / 2 - 8);
      ctx.fillText('tiếp như Flappy Bird — game này chưa hỗ trợ.', Wc / 2, Hc / 2 + 10);
      return;
    }
    if (!netSizes || !genes) {
      ctx.fillStyle = '#8b96ad';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bấm Start rồi chờ hết thế hệ đầu tiên…', Wc / 2, Hc / 2);
      return;
    }

    // Chú giải màu cập nhật động theo tên hành động của game (vd "nhảy") — đặt
    // ở DOM (.legend dưới canvas, xem index.html) thay vì vẽ chữ chèn vào
    // canvas, tránh đè lên lưới màu và đọc rõ hơn (chữ DOM sắc nét hơn canvas).
    const actionName = gameConfig?.outputLabels?.[0] || 'hành động';
    this.el.heatmapLegendYes.textContent = actionName;
    this.el.heatmapLegendNo.textContent = `không ${actionName}`;

    const net = NeuralNetwork.fromGenes(netSizes, Float64Array.from(genes));
    const resolution = 48;
    const grid = computeHeatmapGrid(net, axes, resolution);

    // Chừa đủ chỗ cho nhãn 2 đầu mỗi trục (gần/xa, trên khe/dưới khe) — không
    // chỉ tên trục mà cả 2 điểm mút, để không phải đoán "0 nghĩa là gì".
    const pad = { left: 92, right: 14, top: 22, bottom: 36 };
    const plotW = Wc - pad.left - pad.right;
    const plotH = Hc - pad.top - pad.bottom;
    const cellW = plotW / resolution;
    const cellH = plotH / resolution;

    // Bảng màu ĐẶC (không alpha) — nội suy Xanh dương(0) -> tối trung tính(0.5)
    // -> Xanh lá(1). KHÔNG dùng alpha vì giá trị gần 0.5 sẽ gần trong suốt,
    // trông như "lỗ hổng thiếu dữ liệu" chứ không phải "chưa chắc chắn". Dải
    // tối ở giữa chính là RANH GIỚI QUYẾT ĐỊNH — nhìn là thấy ngay, không cần
    // đoán qua độ đậm nhạt.
    const BLUE = [79, 195, 247], MID = [26, 32, 48], GREEN = [102, 187, 106];
    const heatColor = (v) => {
      const [c1, c2, t] = v < 0.5 ? [BLUE, MID, v / 0.5] : [MID, GREEN, (v - 0.5) / 0.5];
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      return `rgb(${r},${g},${b})`;
    };

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        ctx.fillStyle = heatColor(grid[row][col]);
        const cx = pad.left + col * cellW;
        // row=0 (giá trị trục Y = 0) vẽ ở TRÊN CÙNG — khớp trực giác "0 ở trên,
        // giá trị tăng dần xuống dưới" giống cách đọc yLow (trên) -> yHigh (dưới).
        const cy = pad.top + row * cellH;
        ctx.fillRect(cx, cy, cellW + 0.6, cellH + 0.6); // +0.6 tránh hở khe do làm tròn số thực
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Tên trục (giữa cạnh) — dùng xLabel/yLabel do game khai báo
    ctx.fillStyle = '#dce3f0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(axes.xLabel || 'X', pad.left + plotW / 2, Hc - 6);
    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(axes.yLabel || 'Y', 0, 0);
    ctx.restore();

    // Nhãn 2 ĐẦU mỗi trục (vd "gần"/"xa", "trên khe"/"dưới khe") — thứ khiến
    // heatmap dễ đọc hơn hẳn so với chỉ có tên trục trần trụi.
    ctx.fillStyle = '#8b96ad';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(axes.xLow || '0', pad.left, Hc - 20);
    ctx.textAlign = 'right';
    ctx.fillText(axes.xHigh || '1', Wc - pad.right, Hc - 20);

    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillText(axes.yLow || '0', pad.left - 6, pad.top + 8);
    ctx.fillText(axes.yHigh || '1', pad.left - 6, pad.top + plotH);
    ctx.restore();
  }

  /**
   * Histogram phân bố fitness CẢ QUẦN THỂ ở thế hệ vừa xong — khác biểu đồ
   * best/avg (chỉ 2 con số), đây vẽ TOÀN BỘ N cá thể: thấy "đám mây" dịch
   * sang phải và co cụm lại theo thời gian — đúng bản chất "chọn lọc tự
   * nhiên" mà đường trung bình không lột tả được (vd quần thể phân cực
   * thành 2 nhóm rõ rệt thì avg vẫn chỉ ra 1 con số ở giữa, đánh lừa mắt).
   * @param {number[]} fitnesses — fitness từng cá thể (Trainer.lastGenerationFitnesses)
   * @param {number} bestEver — mốc trục X CỐ ĐỊNH (không tự co giãn theo
   *   từng thế hệ) để thấy đám mây DỊCH so với 1 khung tham chiếu ổn định,
   *   giống cách drawChart() dùng running max thay vì max cục bộ mỗi thế hệ.
   */
  drawFitnessHistogram(fitnesses, bestEver) {
    const ctx = this.histogramCtx;
    const Wc = this.el.histogramCanvas.width;
    const Hc = this.el.histogramCanvas.height;
    const pad = { left: 40, right: 10, top: 10, bottom: 22 };
    const plotW = Wc - pad.left - pad.right;
    const plotH = Hc - pad.top - pad.bottom;

    ctx.clearRect(0, 0, Wc, Hc);
    if (!fitnesses || fitnesses.length === 0) {
      ctx.fillStyle = '#8b96ad';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có dữ liệu…', Wc / 2, Hc / 2);
      return;
    }

    const BINS = 24;
    const maxX = Math.max(1, bestEver) * 1.05;
    const counts = new Array(BINS).fill(0);
    for (const f of fitnesses) {
      const bin = Math.max(0, Math.min(BINS - 1, Math.floor((f / maxX) * BINS)));
      counts[bin]++;
    }
    const maxCount = Math.max(1, ...counts);
    const barW = plotW / BINS;

    // Lưới ngang nhẹ (mốc giữa + đỉnh)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = pad.top + (plotH * i) / 2;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(Wc - pad.right, y); ctx.stroke();
    }

    // Cột histogram
    ctx.fillStyle = 'rgba(102, 187, 106, 0.75)';
    for (let b = 0; b < BINS; b++) {
      const h = (counts[b] / maxCount) * plotH;
      ctx.fillRect(pad.left + b * barW, pad.top + plotH - h, Math.max(1, barW - 1), h);
    }

    // Trục X: 0 .. maxX (fitness)
    ctx.fillStyle = '#8b96ad';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('0', pad.left, Hc - 6);
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(maxX)), Wc - pad.right, Hc - 6);

    // Trục Y: số cá thể
    ctx.fillText(String(maxCount), pad.left - 6, pad.top + 9);
    ctx.fillText('0', pad.left - 6, pad.top + plotH);
  }
}
