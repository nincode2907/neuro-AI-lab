/**
 * ui.js — Gom mọi thao tác DOM + vẽ biểu đồ. DÙNG CHUNG cho mọi game.
 *
 * File này không chứa logic học — chỉ đọc/ghi các control và hiển thị
 * số liệu mà main.js/Trainer đưa sang.
 */

import { registry } from './environments/registry.js';
import { loadLastRun, clearLastRun } from './storage.js';

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
      resumeInfo: document.getElementById('resume-info'),
      btnClearSaved: document.getElementById('btn-clear-saved'),
      xiangqiSettings: document.getElementById('xiangqi-settings'),
      evalDepth: document.getElementById('eval-depth'),
      startLevel: document.getElementById('start-level'),
      flappySettings: document.getElementById('flappy-settings'),
      lookahead: document.getElementById('lookahead'),
      seedsPerGen: document.getElementById('seeds-per-gen'),
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
      metricTooltip: document.getElementById('metric-tooltip'),
      metricTooltipTitle: document.getElementById('metric-tooltip-title'),
      metricTooltipBody: document.getElementById('metric-tooltip-body'),
      summaryOverlay: document.getElementById('summary-overlay'),
      summaryTitle: document.getElementById('summary-title'),
      summaryBody: document.getElementById('summary-body'),
      btnSummaryClose: document.getElementById('btn-summary-close'),
    };
    this.chartCtx = this.el.chart.getContext('2d');
    this.scoreChartCtx = this.el.scoreChart.getContext('2d');
    this.netCtx = this.el.netCanvas.getContext('2d');
    this._lastRankKey = ''; // dấu vân tay của bảng xếp hạng lần vẽ trước — chỉ vẽ lại khi đổi
    this._jumpGeneCount = null; // số gen lớp output hiện tại (= hiddenNodes + 1) — để giải thích từng vị trí
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
    this.el.btnClearSaved.addEventListener('click', () => {
      clearLastRun(this.el.gameSelect.value);
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
   */
  updateRankTable(topRanked, scoreLabel) {
    this.el.rankScoreLabel.childNodes[0].textContent = `${scoreLabel} `;
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

  /**
   * Hiện/ẩn hàng "Khởi tạo quần thể" tuỳ game đang chọn có dữ liệu đã lưu
   * hay không (gọi mỗi khi đổi game, và lúc khởi tạo UI).
   */
  _updateResumeUI() {
    const gameKey = this.el.gameSelect.value;
    const saved = loadLastRun(gameKey);
    const hasSaved = !!(saved && saved.ranked && saved.ranked.length);

    this.el.resumeRow.style.display = hasSaved ? 'flex' : 'none';
    this.el.btnClearSaved.style.display = hasSaved ? 'block' : 'none';

    if (!hasSaved) {
      this.el.initMode.value = 'fresh';
      this.el.resumeInfo.textContent = '';
      this._onInitModeChange();
      return;
    }

    const scoreLabel = (registry[gameKey]?.config.scoreLabel || 'Score').toLowerCase();
    const savedDate = new Date(saved.savedAt).toLocaleString('vi-VN');
    this.el.resumeInfo.textContent =
      `Đã lưu: thế hệ ${saved.generation}, fitness best ${Math.round(saved.bestFitness)}, ` +
      `${scoreLabel} best ${saved.bestScore} (lúc ${savedDate})`;
    this._onInitModeChange();
  }

  /**
   * Khi chọn "Tiếp tục lần chạy trước", khoá & đồng bộ các thông số quyết định
   * KIẾN TRÚC MẠNG (node ẩn, và với Flappy là số ống nhìn trước) về đúng giá
   * trị lúc lưu — gen đã lưu chỉ nạp lại được nếu kiến trúc (độ dài gen) khớp.
   */
  _onInitModeChange() {
    const saved = loadLastRun(this.el.gameSelect.value);
    const resuming = !!(this.el.initMode.value === 'resume' && saved);
    this.el.hiddenNodes.disabled = resuming;
    if (resuming) this.el.hiddenNodes.value = saved.hiddenNodes;

    // Flappy: lookahead cũng đổi số input => khoá về giá trị đã lưu khi resume.
    const lockLookahead = resuming && typeof saved.lookahead === 'number';
    this.el.lookahead.disabled = lockLookahead;
    if (lockLookahead) this.el.lookahead.value = saved.lookahead;
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
      // Có chọn "Tiếp tục lần chạy trước" không (xem storage.js / main.js)
      resume: this.el.initMode.value === 'resume',
      // Thông số riêng Cờ Tướng (game khác bỏ qua trong envOptions)
      evalDepth: Math.max(1, Math.min(2, Number(this.el.evalDepth.value) || 1)),
      startLevel: Math.max(1, Math.min(7, Number(this.el.startLevel.value) || 1)),
      // Thông số riêng Flappy: số ống nhìn trước (đổi số input của mạng)
      lookahead: Math.max(1, Math.min(3, Number(this.el.lookahead.value) || 1)),
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
