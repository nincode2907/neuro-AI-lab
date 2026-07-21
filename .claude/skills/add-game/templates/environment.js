/**
 * <TÊN GAME>.js — Environment <Tên game>.
 *
 * <1–3 câu: game này là gì, AI phải học điều gì, điểm thú vị để quan sát
 *  (vd "2 giai đoạn học" của Snake, "nấc ô lớn" của 2048). Nêu cái làm game
 *  này KHÁC các game đã có — xem kết luận bước "kiểm tra trùng" của skill.>
 *
 * ═══ INTERFACE CHUNG mọi environment phải implement (xem registry.js) ═══
 *   static config = { name, inputs, outputs }
 *   reset(seed)          — về trạng thái đầu, seed để sinh map tái lập được
 *   getInputs()          — mảng số đã CHUẨN HOÁ 0..1 (giác quan của AI)
 *   step(outputs)        — nhận mảng output thô của mạng nơ-ron, tự diễn giải
 *                          thành hành động, cập nhật 1 tick, trả { reward, done }
 *   render(ctx, mode)    — 'full': vẽ cả màn chơi + agent (con đại diện)
 *                          'agent': chỉ vẽ agent (chồng lên màn đã vẽ)
 * ════════════════════════════════════════════════════════════════════════
 */

// XOÁ khối này nếu game KHÔNG có yếu tố ngẫu nhiên. Nếu có: mọi cá thể cùng
// thế hệ phải gặp map/state y hệt nhau (cùng seed) để so fitness công bằng —
// đó là lý do dùng PRNG seed được thay vì Math.random().
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Hằng số luật chơi & kích thước (toạ độ logic = canvas 480x600) ----
// <Khai báo các hằng số ở đây. Comment lý do cho mỗi con số quan trọng —
//  nhất là những số ảnh hưởng tính khả thi / độ khó / cân bằng reward.>

export class <TênGame>Env {
  static config = {
    name: '<Tên hiển thị>',
    inputs: 0,   // <số giác quan — khớp đúng độ dài mảng getInputs() trả về>
    outputs: 0,  // <số hành động; ghi rõ khuôn: ngưỡng >0.5 / argmax / lượng giá>
    inputLabels: [/* nhãn từng input — UI vẽ "bộ não" hiển thị AI nhìn vào gì */],
    outputLabels: [/* nhãn từng output */],
    scoreLabel: '<Nhãn score hiển thị, vd "Ống vượt qua">',
  };

  constructor() {
    this.reset(0);
  }

  reset(seed) {
    // this.rng = mulberry32(seed);   // bật lại nếu game có ngẫu nhiên
    // <đưa mọi state về trạng thái ban đầu; khởi tạo this.ticks = 0, score…>
  }

  /** Con số hiển thị cho người xem (KHÁC fitness = tổng reward). */
  getScore() {
    return 0; // <trả metric: số mồi, ô lớn nhất, quãng đường…>
  }

  /**
   * GIÁC QUAN — mảng số đã CHUẨN HOÁ 0..1.
   * Chuẩn hoá bắt buộc: lớp ẩn dùng tanh, bão hoà ngoài [-3,3]; input thô sẽ
   * đẩy mạng vào vùng bão hoà ngay thế hệ đầu, gradient tiến hoá biến mất.
   * Ưu tiên FEATURE ENGINEERING: đưa thẳng hiệu số/quan hệ quan trọng (như
   * "lệch khe" của Flappy) thay vì toạ độ thô rồi bắt mạng tự học phép trừ.
   */
  getInputs() {
    return []; // <độ dài phải khớp config.inputs>
  }

  /**
   * Một tick: diễn giải outputs → hành động, cập nhật state, trả reward.
   * Khuôn diễn giải output (chọn đúng 1, xoá phần còn lại):
   *   Ngưỡng:  if (outputs[0] > 0.5) doAction();
   *   Argmax:  let a = 0; for (let i=1;i<outputs.length;i++) if (outputs[i]>outputs[a]) a=i;
   *   Lượng giá + tìm kiếm: bỏ qua outputs, tự chạy minimax/expectimax dùng
   *                         this.net (đã nhận qua attachNetwork) làm hàm chấm điểm.
   *
   * Reward: cân tương quan độ lớn giữa "sống sót" (+1/tick, tín hiệu dày cho
   * thế hệ đầu) và "mục tiêu chính" (thưởng lớn khi đạt mục tiêu game). Đây là
   * điểm dễ hỏng việc học nhất — đọc comment reward của flappy.js trước khi chỉnh.
   * @returns {{ reward:number, done:boolean }}
   */
  step(outputs) {
    // this.ticks++;
    return { reward: 0, done: false };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {'full'|'agent'} mode — 'full' vẽ cả cảnh; 'agent' chỉ vẽ agent chồng lên.
   */
  render(ctx, mode = 'full') {
    if (mode === 'full') {
      // <vẽ nền + toàn cảnh>
    }
    // <vẽ agent (đại diện cá thể này) — chạy cho cả 'full' lẫn 'agent'>
  }

  // --- CHỈ khi khuôn "hàm lượng giá + tìm kiếm" (như Cờ Tướng) ---
  // Trainer gọi để đưa mạng của cá thể vào; mạng thành hàm chấm điểm thế cờ.
  // attachNetwork(net) { this.net = net; }
}
