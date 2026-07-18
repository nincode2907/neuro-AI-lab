# 🧬 Neuroevolution Lab — Hướng dẫn

Web app mô phỏng & trực quan hóa quá trình **AI tự học chơi game bằng neuroevolution**
(thuật toán di truyền + mạng nơ-ron). Không framework, không build — HTML/CSS/JS thuần.

## Chạy như thế nào

1. Mở thư mục này trong VS Code.
2. Chuột phải `index.html` → **Open with Live Server**.
3. Chọn game, chỉnh thông số, bấm **▶ Start**. Kéo tốc độ lên x50 để tua nhanh việc học.

### Điểm mục tiêu & kết thúc

- **Điểm mục tiêu**: nhập một số vào ô này thì khi score đạt tới đó, quá trình **tự
  động dừng** và hiện bảng tổng kết. Để trống = chạy vô hạn như bình thường.
- **Pause → Stop**: bấm **⏸ Pause** để tạm dừng. Khi đang dừng, chính nút đó biến
  thành **■ Stop** — bấm lần nữa để **kết thúc** và xem bảng tổng kết. (Muốn chạy
  tiếp thì bấm **▶ Resume**.)
- **Bảng tổng kết** hiện sau khi Stop hoặc đạt mục tiêu: số thế hệ, best-ever, mô tả
  xu hướng học, và **đề xuất chỉnh chỉ số** cho lần sau (tăng/giảm đột biến, node ẩn,
  quần thể…) dựa trên diễn biến vừa rồi. Đóng bảng rồi chỉnh chỉ số và Start lại.

## Neuroevolution hoạt động ra sao (vòng lặp học)

Khác với học có giám sát (backpropagation), ở đây **không ai dạy AI cả**. Nó học bằng
chọn lọc tự nhiên:

```
1. Tạo N cá thể, mỗi con một mạng nơ-ron trọng số NGẪU NHIÊN (thế hệ 0 chơi như "mù")
2. Cả N con cùng chơi một lượt. Mỗi tick:
      giác quan (getInputs) → mạng nơ-ron (forward) → hành động (step) → cộng reward
3. Tất cả chết → xếp hạng theo fitness (tổng reward cả đời)
4. Tiến hoá tạo thế hệ mới:
      • ELITE      — giữ nguyên vài con giỏi nhất (không bao giờ thụt lùi)
      • CHỌN LỌC   — tournament: con giỏi dễ được làm cha mẹ hơn
      • LAI GHÉP   — mỗi gen của con lấy ngẫu nhiên từ cha hoặc mẹ 50/50
      • ĐỘT BIẾN   — mỗi gen có xác suất bị cộng nhiễu Gaussian (nguồn "ý tưởng mới")
5. Quay lại bước 2. Đường fitness đi lên = AI đang học.
```

**"Gen" của một cá thể** = toàn bộ trọng số mạng nơ-ron trải phẳng thành một mảng số.
Hành vi tốt → gen được nhân giống → hành vi ngày càng tốt. Đó là toàn bộ bí mật.

Chi tiết công bằng quan trọng: mỗi thế hệ, mọi cá thể chơi trên **cùng một map**
(cùng seed ngẫu nhiên), nên fitness so sánh được với nhau — và nhờ đó vẽ được cả
bầy chồng lên một màn chơi.

## Đọc các phần trực quan hóa

| Thành phần | Ý nghĩa |
|---|---|
| **Canvas game** | Con đậm = giỏi nhất còn sống; các con mờ = cả bầy đang "thử nghiệm" song song |
| **Thế hệ / Còn sống** | Còn sống tụt về 0 → thế hệ mới bắt đầu |
| **Fitness vs Score** | Fitness = tổng reward (thức ăn của GA). Score = con số người xem hiểu ngay (số ống, số mồi) |
| **Biểu đồ fitness** | Xanh = con giỏi nhất, cam = trung bình. **Đường cam mới là thước đo "cả loài tiến bộ"** — đường xanh có thể ăn may một thế hệ |
| **Biểu đồ score** | Với Snake, đây là nơi nhìn thấy 2 giai đoạn học (xem dưới) |
| **🧠 Bộ não realtime** | Node sáng = kích hoạt mạnh tick này. Dây xanh = trọng số dương, đỏ = âm, dày = mạnh. Nhìn input nào sáng + output nào bật là đoán được AI "đang nghĩ gì" |

## Hai giai đoạn học của Snake (đáng xem nhất)

Snake được thiết kế để lộ rõ hai giai đoạn:

1. **Giai đoạn "đừng chết"** (thường ~10-15 thế hệ đầu): fitness trung bình tăng
   nhờ +1/tick sống sót, nhưng **score gần như nằm ngang ở 0-1** — rắn mới chỉ học
   né tường và né thân mình, thậm chí học "đi vòng tròn" an toàn.
2. **Giai đoạn "săn mồi"**: cơ chế **đói** (120 bước không ăn = chết) khiến chiến
   thuật đi vòng tròn hết đường sống. Những đột biến biết rẽ về phía mồi bắt đầu
   thắng áp đảo → **đường score bật lên** trong khi trước đó chỉ có fitness tăng.

Ranh giới giữa hai giai đoạn chính là chỗ đường xanh lá (score) tách khỏi trục hoành.

Hai quyết định thiết kế làm giai đoạn 2 khả thi (bài học RL thực thụ):

- **Input theo hệ quy chiếu của con rắn**: thay vì cho tọa độ mồi tuyệt đối (bắt mạng
  tự học phép xoay trục — quá khó, GA kẹt ở "đi vòng tròn chờ chết đói"), ta đưa sẵn
  "mồi ở trước/sau, phải/trái". Hành vi đúng trở thành hàm rất đơn giản:
  *mồi bên phải → rẽ phải*.
- **Reward shaping**: mỗi bước tiến gần mồi được +1, lùi xa bị -0.5 — tín hiệu dẫn
  đường nhỏ nhưng đủ để GA "đánh hơi" được hướng đúng. Không có nó, xác suất một bộ
  gen ngẫu nhiên tình cờ biết săn mồi thấp đến mức 80 thế hệ vẫn score = 0 (đã thử!).

## Thông số ảnh hưởng thế nào

| Thông số | Tăng lên thì... |
|---|---|
| **Quần thể N** | Nhiều "ý tưởng" thử song song hơn, học ổn định hơn — nhưng chậm hơn mỗi thế hệ |
| **Tỉ lệ đột biến** | Khám phá mạnh hơn, thoát bẫy cục bộ tốt hơn — nhưng quá cao thì phá hỏng gen tốt, đường fitness nhấp nhô không hội tụ. Thử 0.3+ để xem "loạn" |
| **Node lớp ẩn** | Não "to" hơn, học được hành vi phức tạp hơn — nhưng không gian gen lớn hơn, cần nhiều thế hệ hơn. Flappy chỉ cần 4-8 node |

## Kiến trúc code (3 tầng độc lập)

```
index.html / style.css      giao diện
js/
├── nn.js                   AGENT — mạng nơ-ron (tanh ẩn, sigmoid output), gen = trọng số phẳng
├── ga.js                   TRAINER — thuật toán di truyền, KHÔNG biết gì về luật game
├── ui.js                   UI/VIZ — DOM, biểu đồ, vẽ mạng nơ-ron, dùng chung mọi game
├── main.js                 vòng lặp chính, nối 3 tầng
└── environments/
    ├── registry.js         danh bạ game — dropdown tự sinh từ đây
    ├── flappy.js           ENVIRONMENT: Flappy Bird
    └── snake.js            ENVIRONMENT: Snake
```

## Cắm thêm game mới (không sửa Trainer/UI)

Tạo `js/environments/tengame.js` implement interface chung:

```js
export class TenGameEnv {
  static config = {
    name: 'Tên hiện trên dropdown',
    inputs: 5,                       // số giác quan
    outputs: 2,                      // số hành động
    inputLabels: [...],              // nhãn vẽ mạng nơ-ron (tuỳ chọn)
    outputLabels: [...],
    scoreLabel: 'Điểm',              // tên score hiển thị (tuỳ chọn)
  };
  reset(seed) {}                     // về trạng thái đầu; dùng seed cho mọi thứ ngẫu nhiên
                                     //   (mulberry32 — xem flappy.js) để cả bầy chơi cùng map
  getInputs() { return [...]; }      // mảng số CHUẨN HOÁ 0..1
  step(outputs) {                    // outputs = mảng thô từ mạng, tự diễn giải
    return { reward, done };         //   (1 output: threshold 0.5; nhiều output: argmax)
  }
  getScore() { return this.diem; }   // tuỳ chọn — cho biểu đồ score
  render(ctx, mode) {}               // 'full' = cả màn chơi; 'agent' = chỉ nhân vật (vẽ mờ chồng bầy)
}
```

Rồi thêm 2 dòng vào `registry.js`:

```js
import { TenGameEnv } from './tengame.js';
// ...trong object registry:
tengame: { config: TenGameEnv.config, create: () => new TenGameEnv() },
```

Xong — Trainer, thống kê, cả 2 biểu đồ và hình vẽ bộ não tự hoạt động với game mới.

### Mẹo thiết kế environment (rút từ chính project này)

- **Chuẩn hóa input về 0..1** — mạng nhỏ không tự cân bằng thang đo được.
- **Input tương đối tốt hơn tuyệt đối** — đừng bắt mạng học phép đổi hệ tọa độ.
- **Reward dày (mỗi tick) tốt hơn reward thưa (cuối màn)** — GA cần phân biệt được
  "chết sớm" và "chết muộn" ngay từ thế hệ đầu, khi chưa con nào ghi nổi 1 điểm.
- **Chặn hành vi "lười an toàn"** (đi vòng tròn, đứng im) bằng cơ chế như độ đói,
  nếu không quần thể sẽ hội tụ về đúng hành vi đó.
