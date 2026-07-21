/**
 * play.js — MÀN "CHƠI THỬ": người dùng tự chơi 2048, có thể nhờ model đã train
 * gợi ý nước đi hoặc để model chơi hộ.
 *
 * ĐỘC LẬP hoàn toàn với Trainer: chỉ đọc 1 model đã lưu (storage.saveModel),
 * tái dựng đúng mạng của nó (netSizes suy từ arch), rồi lái một instance
 * Game2048Env qua interface CÓ SẴN của env:
 *   - người chơi:  env.humanMove(dir)          (phím mũi tên / nút d-pad)
 *   - AI gợi ý:    env.recommendDir(net)        (tô sáng 1 nút mũi tên)
 *   - AI chơi hộ:  recommendDir → humanMove     (theo nhịp tốc độ chọn)
 *
 * KHÔNG DOM ở đây — chỉ trạng thái + logic; ui.js lo vẽ, main.js lo vòng lặp.
 */

import { NeuralNetwork } from './nn.js';
import { Game2048Env } from './environments/2048.js';

/** Phím bàn phím → hướng đi. */
export const KEY_TO_DIR = {
  ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
};

// Số FRAME giữa 2 nước khi AI chơi hộ, theo bội tốc độ so với x1. Ở train,
// x1 nghĩa là 1 nước mỗi TICKS_PER_MOVE (=60) frame; nên xN = 60/N frame/nước:
//   chậm 3x → 20 frame/nước · vừa 10x → 6 · nhanh 20x → 3.
export const SPEED_FRAMES = { slow: 20, normal: 6, fast: 3 };

export class PlaySession {
  /**
   * @param {object} model — 1 entry từ storage.loadModels('2048'): cần
   *   `arch` (hiddenNodes, searchDepth, strategies) và `genes` (trọng số phẳng).
   */
  constructor(model) {
    const arch = model.arch || {};
    this.envOptions = {
      searchDepth: arch.searchDepth ?? 1,
      strategies: Array.isArray(arch.strategies) ? arch.strategies.slice() : [],
    };
    // netSizes phải khớp lúc train: inputs/outputs suy từ configFor (đổi theo
    // searchDepth + số mẹo), hidden = arch.hiddenNodes.
    const cfg = Game2048Env.configFor(this.envOptions);
    this.netSizes = [cfg.inputs, arch.hiddenNodes, cfg.outputs];
    this.net = NeuralNetwork.fromGenes(this.netSizes, Float64Array.from(model.genes));

    this.env = new Game2048Env(this.envOptions);
    if (typeof this.env.attachNetwork === 'function') this.env.attachNetwork(this.net);

    this.aiMode = false;      // true = model đang chơi hộ
    this.speed = 'normal';    // slow | normal | fast
    this.hintDir = null;      // hướng "AI gợi ý" đang tô sáng (null = không gợi ý)
    this._aiAcc = 0;          // đếm frame để nhả nước AI theo nhịp tốc độ
    this.reset();
  }

  /** Ván mới (seed ngẫu nhiên khác nhau mỗi lần). */
  reset() {
    this.env.reset((Math.random() * 2 ** 31) | 0);
    this.hintDir = null;
    this._aiAcc = 0;
  }

  get score() { return this.env.getScore(); }
  isOver() { return this.env.isOver(); }

  /** Người chơi đi 1 nước (bỏ qua khi AI đang chơi hộ hoặc ván đã hết). */
  humanMove(dir) {
    if (this.aiMode || this.isOver()) return;
    this.hintDir = null; // đã đi thì bỏ gợi ý cũ
    this.env.humanMove(dir);
  }

  /** Hỏi model 1 nước gợi ý cho thế cờ hiện tại → tô sáng nút mũi tên đó. */
  requestHint() {
    this.hintDir = this.isOver() ? null : this.env.recommendDir(this.net);
    return this.hintDir;
  }

  /** Bật/tắt "AI chơi hộ". */
  setAiMode(on) {
    this.aiMode = on;
    this.hintDir = null;
    this._aiAcc = 0;
  }

  setSpeed(speed) {
    if (SPEED_FRAMES[speed]) this.speed = speed;
  }

  /**
   * Gọi MỖI FRAME từ vòng lặp vẽ (main.js). Tăng ticks để env nội suy
   * animation, và nếu đang AI chơi hộ thì nhả 1 nước mỗi SPEED_FRAMES frame.
   */
  tickFrame() {
    this.env.ticks++; // nhịp animation của render()
    if (this.aiMode && !this.isOver()) {
      if (++this._aiAcc >= SPEED_FRAMES[this.speed]) {
        this._aiAcc = 0;
        const dir = this.env.recommendDir(this.net);
        if (dir) this.env.humanMove(dir);
      }
    }
  }
}
