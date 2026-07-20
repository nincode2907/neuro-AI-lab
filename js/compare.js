/**
 * compare.js — "Trước vs Sau": chạy 2 genome (con thế hệ đầu vs con hiện tại)
 * CÙNG LÚC trên CÙNG 1 seed (cùng dàn ống/địa hình/bàn cờ...) để thấy trực
 * quan AI đã học được bao nhiêu, thay vì chỉ nhìn số trên biểu đồ.
 *
 * Hoàn toàn ĐỘC LẬP với Trainer đang huấn luyện: chỉ đọc 2 mảng gen đã chụp
 * sẵn (Trainer.gen1BestGenes / currentBestGenes) một lần lúc khởi tạo, tự
 * dựng 2 cặp {net, env} riêng rồi tự chạy — không đụng gì tới quần thể đang
 * tiến hoá. Dùng lại NGUYÊN nn.js + đúng interface Environment chung
 * (reset/getInputs/step/render) nên chạy được với BẤT KỲ game nào trong
 * registry, không hardcode logic riêng của game nào.
 */

import { NeuralNetwork } from './nn.js';

// Chặn treo nếu 1 bên "bất tử" (vd chơi quá giỏi không bao giờ chết) —
// tương đương tinh thần maxStepsPerGen của Trainer nhưng cục bộ cho so sánh.
const MAX_TICKS = 20000;

export class ComparisonRun {
  /**
   * @param {object} opts
   * @param {number[]} opts.netSizes — kiến trúc mạng [inputs, hidden, outputs]
   * @param {(opts:object) => object} opts.envFactory — factory tạo environment (từ registry)
   * @param {object} opts.envOptions — tham số riêng của game (Cờ Tướng, Flappy...)
   * @param {Float64Array|number[]} opts.beforeGenes — gen "trước" (con thế hệ đầu)
   * @param {Float64Array|number[]} opts.afterGenes — gen "sau" (con hiện tại)
   */
  constructor({ netSizes, envFactory, envOptions, beforeGenes, afterGenes }) {
    this.netSizes = netSizes;
    // Cùng 1 seed cho cả 2 bên — "cùng 1 dàn ống" đúng như yêu cầu, để phép
    // so sánh công bằng (khác seed thì có thể 1 bên chỉ đơn giản gặp map dễ hơn).
    const seed = (Math.random() * 2 ** 31) | 0;
    this.before = this._makeSide(envFactory, envOptions, beforeGenes, seed);
    this.after = this._makeSide(envFactory, envOptions, afterGenes, seed);
  }

  _makeSide(envFactory, envOptions, genes, seed) {
    const net = NeuralNetwork.fromGenes(this.netSizes, Float64Array.from(genes));
    const env = envFactory(envOptions);
    // Hook chung cho game dùng mạng làm hàm đánh giá thay vì chọn hành động
    // trực tiếp (vd Cờ Tướng minimax+NN) — cùng cơ chế Trainer._makeIndividual.
    if (typeof env.attachNetwork === 'function') env.attachNetwork(net);
    env.reset(seed);
    return { net, env, done: false, ticks: 0 };
  }

  /**
   * Chạy 1 tick cho cả 2 bên (bên nào đã done thì bỏ qua, không step tiếp).
   * @returns {boolean} true nếu CẢ HAI đã xong (dừng vòng lặp bên ngoài được)
   */
  step() {
    for (const side of [this.before, this.after]) {
      if (side.done) continue;
      const inputs = side.env.getInputs();
      const outputs = side.net.forward(inputs);
      const { done } = side.env.step(outputs);
      side.ticks++;
      if (done || side.ticks >= MAX_TICKS) side.done = true;
    }
    return this.before.done && this.after.done;
  }
}
