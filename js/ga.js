/**
 * ga.js — Trainer: thuật toán di truyền (Genetic Algorithm), DÙNG CHUNG cho mọi game.
 *
 * Trainer KHÔNG biết gì về luật chơi cụ thể — nó chỉ nói chuyện với environment
 * qua interface chung (reset / getInputs / step / render). Nhờ vậy cắm thêm
 * game mới không cần sửa file này.
 *
 * ══════════════════ VÒNG LẶP HỌC (đọc kỹ đoạn này!) ══════════════════
 *
 *  1. Tạo N cá thể, mỗi con một mạng nơ-ron trọng số NGẪU NHIÊN.
 *  2. Cả N con cùng chơi 1 lượt (mỗi con một bản sao env, CÙNG SEED để
 *     chướng ngại vật giống hệt nhau — so sánh fitness mới công bằng).
 *     Mỗi tick:  inputs = env.getInputs()  →  outputs = net.forward(inputs)
 *                →  env.step(outputs)  →  cộng dồn reward vào fitness.
 *  3. Khi TẤT CẢ chết (hoặc hết giờ) → onGenerationEnd(). Nếu `seedsPerGen`
 *     > 1, chơi lại NGUYÊN quần thể này với seed khác (net giữ nguyên) cho
 *     đủ số dàn ống yêu cầu, rồi lấy fitness = TRUNG BÌNH CỘNG qua các seed —
 *     tránh elite chỉ "ăn may" gặp đúng 1 dàn ống dễ. Cuối cùng xếp hạng.
 *  4. Tiến hoá:  giữ nguyên vài con giỏi nhất (ELITE)
 *                + chọn lọc cha mẹ (thiên vị con giỏi)
 *                + lai ghép gen (CROSSOVER)
 *                + đột biến ngẫu nhiên (MUTATION).
 *  5. Quay lại bước 2 với thế hệ mới. Fitness trung bình tăng dần = AI đang học.
 * ════════════════════════════════════════════════════════════════════
 */

import { NeuralNetwork, randGaussian } from './nn.js';

// Số cá thể tốt nhất giữ lại làm snapshot mỗi thế hệ (xem this.lastRanked) —
// đủ để làm "vốn gen" phong phú khi tiếp tục tiến hoá ở lần chạy sau, nhưng
// không lưu cả quần thể (JSON hoá vào localStorage) cho nặng.
const SNAPSHOT_SIZE = 30;

export class Trainer {
  /**
   * @param {object} opts
   * @param {() => object} opts.envFactory — hàm tạo environment mới (từ registry)
   * @param {object} opts.envConfig — { inputs, outputs } của game
   * @param {number} opts.popSize — kích thước quần thể N
   * @param {number} opts.mutationRate — xác suất mỗi gen bị đột biến (0..1)
   * @param {number} opts.hiddenNodes — số node lớp ẩn
   * @param {number} [opts.eliteCount] — số con giỏi nhất được giữ nguyên
   * @param {number} [opts.maxStepsPerGen] — chặn trần 1 thế hệ (khi AI chơi quá giỏi, bất tử)
   * @param {object} [opts.envOptions] — tham số riêng của game, truyền thẳng vào envFactory
   *   (vd Cờ Tướng: { evalDepth, startLevel }). Flappy/Snake bỏ qua.
   * @param {{genes:number[], fitness:number}[]} [opts.seedRanked] — gen đã lưu
   *   từ lần chạy trước (top cá thể, xếp giảm dần theo fitness). Nếu có, quần
   *   thể khởi đầu được "gây giống" từ đây thay vì random hoàn toàn — xem
   *   storage.js. Bỏ qua (null/rỗng) => random như bình thường.
   * @param {number} [opts.startGeneration] — số thứ tự thế hệ bắt đầu đếm từ
   *   (dùng khi resume để biểu đồ/nhãn thế hệ nối tiếp lần chạy trước).
   * @param {number} [opts.seedsPerGen] — mỗi cá thể chơi bao nhiêu dàn ống
   *   (seed) KHÁC NHAU trước khi thực sự tiến hoá; fitness dùng để xếp hạng
   *   là TRUNG BÌNH CỘNG qua các seed đó — tránh elite "ăn may" gặp seed dễ,
   *   xem onGenerationEnd(). 1 = như cũ (1 seed/thế hệ).
   */
  constructor({ envFactory, envConfig, popSize, mutationRate, hiddenNodes,
                eliteCount = 4, maxStepsPerGen = 8000, envOptions = {},
                seedRanked = null, startGeneration = 1, seedsPerGen = 1 }) {
    this.envFactory = envFactory;
    this.envConfig = envConfig;
    this.popSize = popSize;
    this.mutationRate = mutationRate;
    this.eliteCount = Math.min(eliteCount, popSize);
    this.maxStepsPerGen = maxStepsPerGen;
    this.envOptions = envOptions;
    this.seedsPerGen = Math.max(1, seedsPerGen);
    this.seedRound = 0; // vòng seed hiện tại trong thế hệ (0-based)

    // Kiến trúc mạng: inputs của game -> lớp ẩn -> outputs của game
    this.netSizes = [envConfig.inputs, hiddenNodes, envConfig.outputs];

    this.generation = startGeneration;
    this.bestEver = 0;
    this.bestEverScore = 0; // score riêng của game (số ống / số mồi...), qua env.getScore()
    this.stepCount = 0;
    // Lịch sử để vẽ biểu đồ: [{ gen, best, avg, score }]
    this.history = [];
    // Snapshot top cá thể (gen + fitness) của thế hệ gần nhất đã hoàn thành —
    // main.js đọc cái này sau mỗi evolve() để lưu ra storage.js.
    this.lastRanked = null;

    // Bước 1: quần thể khởi đầu — hoặc random hoàn toàn (não "mù"), hoặc
    // gây giống lại từ gen đã lưu của lần chạy trước (seedRanked), dùng
    // ĐÚNG cơ chế elitism + chọn lọc + lai ghép + đột biến mà evolve() dùng.
    this.population = (seedRanked && seedRanked.length)
      ? this._breed(this._toPseudoRanked(seedRanked))
      : this._randomPopulation();

    this._resetEnvs();
  }

  /** Quần thể hoàn toàn ngẫu nhiên — thế hệ 0 khi không có gen nào để kế thừa. */
  _randomPopulation() {
    const pop = [];
    const { total } = this._outputGeneRange();
    for (let i = 0; i < this.popSize; i++) {
      const net = new NeuralNetwork(this.netSizes);
      const ind = this._makeIndividual(net);
      // Thế hệ đầu tiên — chưa có "thế hệ trước" nào để so sánh.
      ind.jumpGenesChanged = null;
      ind.jumpGenesTotal = total;
      ind.isElite = false;
      ind.geneType = 'random'; // não hoàn toàn ngẫu nhiên, chưa qua chọn lọc/lai ghép nào
      ind.sourceScore = null; // chưa có thế hệ trước nào để tra "kỉ lục cũ"
      ind.jumpGeneValues = this._jumpGenesOf(net.getGenes());
      pop.push(ind);
    }
    return pop;
  }

  /**
   * Vùng gen (trong mảng phẳng getGenes()) của LỚP OUTPUT — trọng số + bias
   * biến kích hoạt lớp ẩn thành xác suất nhảy cuối cùng (sigmoid). Đây là
   * những gen ảnh hưởng TRỰC TIẾP nhất tới quyết định "nhảy hay không" mỗi
   * tick, nên dùng để đo cá thể này "đổi hành vi nhảy" bao nhiêu so với thế
   * hệ trước (xem _breed()). Thứ tự gen theo đúng NeuralNetwork.getGenes():
   * [w0, b0, w1, b1] — lớp output là (w1, b1), nằm ở cuối mảng.
   */
  _outputGeneRange() {
    const [nIn, nHid, nOut] = this.netSizes;
    const layer0Len = nHid * nIn + nHid;
    const layer1Len = nOut * nHid + nOut;
    return { start: layer0Len, end: layer0Len + layer1Len, total: layer1Len };
  }

  /** Trích giá trị RAW của các gen lớp output từ 1 mảng gen phẳng (Float64Array). */
  _jumpGenesOf(genes) {
    const { start, end } = this._outputGeneRange();
    return Array.from(genes.subarray(start, end));
  }

  /**
   * Score (kỉ lục game — vd số ống vượt) của MỘT PHẦN TỬ trong `ranked`. Chấp
   * nhận cả cá thể thật (đọc trực tiếp qua env.getScore(), trước khi env bị
   * reset ở evolve()) LẪN "cá thể giả" phục hồi từ gen đã lưu khi resume
   * (không có `.env`, đọc field `.score` đã lưu sẵn — xem _toPseudoRanked).
   * null nếu không có dữ liệu (vd cá thể giả từ 1 lần lưu cũ không có score).
   */
  _scoreOf(ind) {
    if (ind.env && typeof ind.env.getScore === 'function') return ind.env.getScore();
    return typeof ind.score === 'number' ? ind.score : null;
  }

  /**
   * Biến gen thô đã lưu (JSON, từ storage.js) thành "cá thể giả" có đủ
   * `net`/`fitness` để dùng lại được _select()/_breed() y hệt như với quần
   * thể thật vừa chơi xong. seedRanked đã được sắp xếp giảm dần theo fitness
   * lúc lưu (xem evolve() bên dưới) nên thứ tự elite vẫn đúng.
   */
  _toPseudoRanked(seedRanked) {
    return seedRanked.map((r) => ({
      net: NeuralNetwork.fromGenes(this.netSizes, Float64Array.from(r.genes)),
      fitness: r.fitness,
      score: typeof r.score === 'number' ? r.score : null,
    }));
  }

  /**
   * Tạo 1 cá thể = { net, env, fitness, alive }. Nếu environment có hook
   * attachNetwork (vd Cờ Tướng dùng mạng làm hàm đánh giá cho minimax), đưa
   * mạng của cá thể vào env. Đây là điểm mở rộng CHUNG, không hardcode game nào.
   */
  _makeIndividual(net) {
    const env = this.envFactory(this.envOptions);
    if (typeof env.attachNetwork === 'function') env.attachNetwork(net);
    return { net, env, fitness: 0, fitnessAccum: 0, alive: true };
  }

  /**
   * Cho cả quần thể chơi lại từ đầu, CÙNG một seed => map giống hệt nhau.
   * Chỉ reset `fitness` (điểm của VÒNG SEED sắp chơi) — KHÔNG đụng
   * `fitnessAccum` (tổng dồn qua các seed trước đó của cùng thế hệ), để
   * onGenerationEnd() cộng dồn đúng qua nhiều dàn ống (seedsPerGen).
   */
  _resetEnvs() {
    const seed = (Math.random() * 2 ** 31) | 0;
    for (const ind of this.population) {
      ind.env.reset(seed);
      ind.fitness = 0;
      ind.alive = true;
    }
    this.stepCount = 0;
  }

  /**
   * Bước 2 của vòng lặp: chạy MỘT tick mô phỏng cho mọi cá thể còn sống.
   * @returns {number} số cá thể còn sống sau tick này
   */
  stepAll() {
    let aliveCount = 0;
    const timeUp = ++this.stepCount >= this.maxStepsPerGen;

    for (const ind of this.population) {
      if (!ind.alive) continue;

      // GIÁC QUAN -> NÃO -> HÀNH ĐỘNG: cốt lõi của agent
      const inputs = ind.env.getInputs();
      const outputs = ind.net.forward(inputs);
      const { reward, done } = ind.env.step(outputs);

      ind.fitness += reward; // fitness = tổng reward tích luỹ cả đời

      if (done || timeUp) {
        ind.alive = false;
      } else {
        aliveCount++;
      }
    }
    return aliveCount;
  }

  /** Fitness cao nhất trong thế hệ ĐANG chạy (để hiện realtime). */
  currentBestFitness() {
    let best = 0;
    for (const ind of this.population) best = Math.max(best, ind.fitness);
    return best;
  }

  /**
   * Score game cao nhất của thế hệ đang chạy (nếu env có getScore()).
   * Khác fitness: score là con số "người xem" hiểu ngay — số ống vượt, số mồi ăn.
   */
  currentBestScore() {
    let best = 0;
    for (const ind of this.population) {
      if (ind.env.getScore) best = Math.max(best, ind.env.getScore());
    }
    return best;
  }

  /** Cá thể còn sống có fitness cao nhất (để render "con giỏi nhất"). */
  bestAlive() {
    let best = null;
    for (const ind of this.population) {
      if (ind.alive && (!best || ind.fitness > best.fitness)) best = ind;
    }
    return best;
  }

  aliveIndividuals() {
    return this.population.filter((ind) => ind.alive);
  }

  /**
   * Top N cá thể của quần thể ĐANG chạy, xếp hạng giảm dần theo fitness live
   * (khác `lastRanked` — đó là snapshot đã CHỐT của thế hệ vừa xong). Dùng để
   * vẽ bảng xếp hạng realtime: thứ hạng đổi liên tục ngay trong lúc chơi vì
   * fitness của từng con tăng dần mỗi tick còn sống.
   */
  topRanked(n = 20) {
    return [...this.population]
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, n);
  }

  /**
   * Gọi khi cả bầy vừa chết hết (main.js: alive === 0). Nếu `seedsPerGen` > 1,
   * đây có thể mới là 1 trong nhiều dàn ống cần chơi cho thế hệ này — cộng dồn
   * fitness của vòng vừa xong rồi cho chơi lại với SEED KHÁC (net giữ nguyên,
   * không tiến hoá). Chỉ khi đã chơi đủ `seedsPerGen` dàn ống mới thực sự
   * tính fitness = TRUNG BÌNH CỘNG và gọi evolve() để tạo thế hệ mới.
   *
   * Tại sao trung bình thay vì 1 seed: 1 seed/thế hệ khiến elite có thể chỉ
   * là con "ăn may" gặp dàn ống dễ, mang gen không tổng quát sang đời sau —
   * xem đầu file ga.js. Trung bình qua nhiều seed làm giảm variance của phép
   * đo fitness, giúp nó phản ánh đúng hơn năng lực CHUNG thay vì năng lực trên
   * đúng 1 tình huống ngẫu nhiên.
   *
   * @returns {boolean} true nếu thế hệ vừa THỰC SỰ tiến hoá (evolve() đã chạy)
   */
  onGenerationEnd() {
    for (const ind of this.population) {
      ind.fitnessAccum += ind.fitness;
    }
    this.seedRound++;

    if (this.seedRound < this.seedsPerGen) {
      this._resetEnvs(); // seed mới, net giữ nguyên, chưa tiến hoá
      return false;
    }

    // Đã chơi đủ dàn ống cho thế hệ này — chốt fitness = trung bình cộng.
    for (const ind of this.population) {
      ind.fitness = ind.fitnessAccum / this.seedsPerGen;
    }
    this.seedRound = 0;
    this.evolve();
    return true;
  }

  /**
   * Bước 3 + 4: cả thế hệ đã chết → ghi lịch sử → tạo thế hệ mới.
   * Đây là chỗ "học" thực sự diễn ra: gen tốt được nhân giống, gen tồi bị loại.
   */
  evolve() {
    // --- Xếp hạng theo fitness giảm dần ---
    const ranked = [...this.population].sort((a, b) => b.fitness - a.fitness);
    const best = ranked[0].fitness;
    const avg = ranked.reduce((s, ind) => s + ind.fitness, 0) / ranked.length;
    const score = this.currentBestScore(); // đọc TRƯỚC khi env bị reset
    this.bestEver = Math.max(this.bestEver, best);
    this.bestEverScore = Math.max(this.bestEverScore, score);
    this.history.push({ gen: this.generation, best, avg, score });

    // --- Snapshot top gen của thế hệ vừa xong — để main.js lưu ra storage.js
    // và có thể "tiếp tục" từ đây ở lần chạy sau (xem constructor/_toPseudoRanked). ---
    const snapCount = Math.min(SNAPSHOT_SIZE, ranked.length);
    this.lastRanked = ranked.slice(0, snapCount).map((ind) => ({
      genes: Array.from(ind.net.getGenes()),
      fitness: ind.fitness,
      score: this._scoreOf(ind),
    }));

    this.population = this._breed(ranked);
    this.generation++;
    this._resetEnvs();
  }

  /**
   * Xây MỘT quần thể mới từ một danh sách đã xếp hạng giảm dần theo fitness
   * (`ranked`): elitism + chọn lọc + lai ghép + đột biến. Dùng chung cho
   * evolve() (ranked = thế hệ vừa chơi xong) VÀ cho khởi tạo từ gen đã lưu
   * (ranked = cá thể giả phục hồi từ JSON, xem _toPseudoRanked).
   */
  _breed(ranked) {
    const newPop = [];
    const { start, end, total } = this._outputGeneRange();

    // --- ELITE: sao chép NGUYÊN VẸN vài con giỏi nhất, không đột biến ---
    // Đảm bảo thế hệ sau không bao giờ tệ hơn thành quả tốt nhất đã đạt được.
    // jumpGenesChanged = 0 & isElite = true: giữ nguyên y hệt, không đổi gì so với trước
    // — UI hiện các gen của elite ở dạng "trơn" (không tô màu), làm mốc tham chiếu.
    const eliteN = Math.min(this.eliteCount, ranked.length);
    for (let i = 0; i < eliteN; i++) {
      const clonedNet = ranked[i].net.clone();
      const ind = this._makeIndividual(clonedNet);
      ind.jumpGenesChanged = 0;
      ind.jumpGenesTotal = total;
      ind.isElite = true;
      ind.geneType = 'elite';
      // Elite = chính xác gen này ở thế hệ trước — "kỉ lục cũ" = score CHÍNH
      // NÓ đã đạt được lúc đó (không phải score đang chơi live của thế hệ mới).
      ind.sourceScore = this._scoreOf(ranked[i]);
      ind.jumpGeneValues = this._jumpGenesOf(clonedNet.getGenes());
      newPop.push(ind);
    }

    // --- Phần còn lại: chọn lọc + lai ghép + đột biến ---
    while (newPop.length < this.popSize) {
      const parentA = this._select(ranked);
      const parentB = this._select(ranked);
      const childGenes = this._crossover(parentA.net.getGenes(), parentB.net.getGenes());
      const mutatedIdx = this._mutate(childGenes);
      const ind = this._makeIndividual(NeuralNetwork.fromGenes(this.netSizes, childGenes));
      // Số gen lớp OUTPUT (quyết định xác suất nhảy) vừa bị đột biến — đo
      // "hành vi nhảy" của con này lệch khỏi thế hệ trước bao nhiêu.
      ind.jumpGenesChanged = mutatedIdx.reduce((c, idx) => c + (idx >= start && idx < end ? 1 : 0), 0);
      ind.jumpGenesTotal = total;
      ind.isElite = false;
      // "Loại gen": mutatedIdx đếm trên TOÀN BỘ genome (không chỉ lớp output)
      // — có gen nào bị đột biến (bất kỳ đâu) thì tính là "mutated", còn
      // không thì con này thuần tuý là lai ghép (crossover) của cha mẹ.
      ind.geneType = mutatedIdx.length > 0 ? 'mutated' : 'crossover';
      // Lai ghép/đột biến từ gen cũ nào thì "kỉ lục cũ" lấy theo gen đó —
      // con này trộn gen của CẢ 2 cha mẹ nên lấy record cao hơn trong 2 (đại
      // diện cho "nguồn gốc tốt nhất" mà nó thừa hưởng).
      const scoreA = this._scoreOf(parentA);
      const scoreB = this._scoreOf(parentB);
      ind.sourceScore = (scoreA == null && scoreB == null)
        ? null
        : Math.max(scoreA ?? -Infinity, scoreB ?? -Infinity);
      ind.jumpGeneValues = this._jumpGenesOf(childGenes);
      newPop.push(ind);
    }

    return newPop;
  }

  /**
   * CHỌN LỌC kiểu tournament: bốc ngẫu nhiên k con, lấy con giỏi nhất.
   * Con giỏi có xác suất làm cha mẹ cao hơn, nhưng con dở vẫn có cơ hội
   * => giữ đa dạng gen, tránh kẹt ở lời giải cục bộ.
   */
  _select(ranked, k = 5) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const cand = ranked[(Math.random() * ranked.length) | 0];
      if (!best || cand.fitness > best.fitness) best = cand;
    }
    return best;
  }

  /**
   * LAI GHÉP đồng nhất (uniform crossover): mỗi gen của con lấy ngẫu nhiên
   * từ cha hoặc mẹ 50/50 — trộn hai "chiến thuật" tốt thành một.
   */
  _crossover(genesA, genesB) {
    const child = new Float64Array(genesA.length);
    for (let i = 0; i < child.length; i++) {
      child[i] = Math.random() < 0.5 ? genesA[i] : genesB[i];
    }
    return child;
  }

  /**
   * ĐỘT BIẾN: mỗi gen có xác suất mutationRate bị cộng thêm nhiễu Gaussian.
   * Đây là nguồn "ý tưởng mới" duy nhất — không có đột biến, quần thể chỉ
   * trộn lại những gì đã có và sẽ ngừng tiến bộ.
   * @returns {number[]} chỉ số các gen vừa bị đột biến (để _breed() đo xem
   *   bao nhiêu gen "quyết định nhảy" vừa đổi so với thế hệ trước).
   */
  _mutate(genes) {
    const mutated = [];
    for (let i = 0; i < genes.length; i++) {
      if (Math.random() < this.mutationRate) {
        genes[i] += randGaussian(0, 0.5);
        mutated.push(i);
      }
    }
    return mutated;
  }
}
