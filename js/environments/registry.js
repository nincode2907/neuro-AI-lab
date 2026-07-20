/**
 * registry.js — Danh bạ các game (environment).
 *
 * MUỐN THÊM GAME MỚI? Chỉ cần 2 bước, KHÔNG sửa trainer/UI:
 *   1. Viết class environment mới trong thư mục này, implement đúng interface:
 *        static config = { name, inputs, outputs }
 *        reset(seed) / getInputs() / step(outputs) / render(ctx, mode)
 *      (xem flappy.js làm mẫu, interface được mô tả kỹ ở đầu file đó)
 *   2. Import và thêm 1 dòng vào object `registry` bên dưới.
 * Dropdown chọn game trong UI tự sinh từ registry này.
 */

import { FlappyEnv } from './flappy.js';
import { SnakeEnv } from './snake.js';
import { Game2048Env } from './2048.js';
import { HillClimbEnv } from './hillclimb.js';
import { XiangqiEnv } from '../xiangqi/environment.js';

// create nhận (opts) — tham số riêng của game do Trainer truyền vào (envOptions).
// Game nào không cần thì bỏ qua đối số này.
export const registry = {
  flappy: {
    config: FlappyEnv.config,                       // config mặc định (lookahead=1)
    configFor: (opts) => FlappyEnv.configFor(opts), // config động: số input đổi theo lookahead
    create: (opts) => new FlappyEnv(opts),          // factory tạo instance mới (opts = { lookahead })
  },
  snake: {
    config: SnakeEnv.config,
    create: () => new SnakeEnv(),
  },
  '2048': {
    config: Game2048Env.config,
    create: () => new Game2048Env(),
  },
  hillclimb: {
    config: HillClimbEnv.config,
    create: () => new HillClimbEnv(),
  },
  xiangqi: {
    config: XiangqiEnv.config,
    create: (opts) => new XiangqiEnv(opts),  // opts = { evalDepth, startLevel }
  },
};
