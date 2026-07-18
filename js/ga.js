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
 *  3. Khi TẤT CẢ chết (hoặc hết giờ) → xếp hạng theo fitness.
 *  4. Tiến hoá:  giữ nguyên vài con giỏi nhất (ELITE)
 *                + chọn lọc cha mẹ (thiên vị con giỏi)
 *                + lai ghép gen (CROSSOVER)
 *                + đột biến ngẫu nhiên (MUTATION).
 *  5. Quay lại bước 2 với thế hệ mới. Fitness trung bình tăng dần = AI đang học.
 * ════════════════════════════════════════════════════════════════════
 */

import { NeuralNetwork, randGaussian } from './nn.js';

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
   */
  constructor({ envFactory, envConfig, popSize, mutationRate, hiddenNodes,
                eliteCount = 4, maxStepsPerGen = 8000 }) {
    this.envFactory = envFactory;
    this.envConfig = envConfig;
    this.popSize = popSize;
    this.mutationRate = mutationRate;
    this.eliteCount = Math.min(eliteCount, popSize);
    this.maxStepsPerGen = maxStepsPerGen;

    // Kiến trúc mạng: inputs của game -> lớp ẩn -> outputs của game
    this.netSizes = [envConfig.inputs, hiddenNodes, envConfig.outputs];

    this.generation = 1;
    this.bestEver = 0;
    this.bestEverScore = 0; // score riêng của game (số ống / số mồi...), qua env.getScore()
    this.stepCount = 0;
    // Lịch sử để vẽ biểu đồ: [{ gen, best, avg, score }]
    this.history = [];

    // Bước 1: quần thể khởi đầu — não hoàn toàn ngẫu nhiên
    this.population = [];
    for (let i = 0; i < popSize; i++) {
      this.population.push({
        net: new NeuralNetwork(this.netSizes),
        env: envFactory(),
        fitness: 0,
        alive: true,
      });
    }
    this._resetEnvs();
  }

  /** Cho cả quần thể chơi lại từ đầu, CÙNG một seed => map giống hệt nhau. */
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

    const newPop = [];

    // --- ELITE: sao chép NGUYÊN VẸN vài con giỏi nhất, không đột biến ---
    // Đảm bảo thế hệ sau không bao giờ tệ hơn thành quả tốt nhất đã đạt được.
    for (let i = 0; i < this.eliteCount; i++) {
      newPop.push({
        net: ranked[i].net.clone(),
        env: this.envFactory(),
        fitness: 0,
        alive: true,
      });
    }

    // --- Phần còn lại: chọn lọc + lai ghép + đột biến ---
    while (newPop.length < this.popSize) {
      const parentA = this._select(ranked);
      const parentB = this._select(ranked);
      const childGenes = this._crossover(parentA.net.getGenes(), parentB.net.getGenes());
      this._mutate(childGenes);
      newPop.push({
        net: NeuralNetwork.fromGenes(this.netSizes, childGenes),
        env: this.envFactory(),
        fitness: 0,
        alive: true,
      });
    }

    this.population = newPop;
    this.generation++;
    this._resetEnvs();
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
   */
  _mutate(genes) {
    for (let i = 0; i < genes.length; i++) {
      if (Math.random() < this.mutationRate) {
        genes[i] += randGaussian(0, 0.5);
      }
    }
  }
}
