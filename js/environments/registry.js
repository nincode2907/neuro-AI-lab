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

export const registry = {
  flappy: {
    config: FlappyEnv.config,          // { name, inputs, outputs, ...metadata }
    create: () => new FlappyEnv(),     // factory tạo instance mới
  },
  snake: {
    config: SnakeEnv.config,
    create: () => new SnakeEnv(),
  },
};
