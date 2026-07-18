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
    ├── snake.js            ENVIRONMENT: Snake
    ├── 2048.js             ENVIRONMENT: 2048
    └── hillclimb.js        ENVIRONMENT: Hill Climb Racing
js/xiangqi/                 CỜ TƯỚNG (dùng chung tầng GA + UI)
├── lib/xiangqi.js          thư viện luật cờ (vendored, BSD-2, lengyanyu258/xiangqi.js)
├── heuristic.js            hàm đánh giá thế cờ CỐ ĐỊNH (bộ não bot)
├── minimax.js              minimax + alpha-beta, độ sâu tham số
├── bot.js                  bot 7 cấp (độ sâu + ngẫu nhiên top-K)
├── nnEvaluator.js          NN đánh giá thế cờ — THAY heuristic khi tiến hoá
├── environment.js          ENVIRONMENT: mỗi step = 1 ván, leo thang cấp bot
└── coords.js               đổi toạ độ (row,col) ↔ ô ICCS
xiangqi-test.html           trang test luật + bot (người vs bot), độc lập UI chính
```

## 2048 — 4 hành động rời rạc, "sai nước = chết"

Giống Snake, 2048 dùng **argmax trên 4 output** (lên/phải/xuống/trái) thay vì threshold
1 output như Flappy. Input gồm 16 ô bàn cờ (chuẩn hoá `log2(giá trị)/16`) + 4 cờ "hướng
này còn đi được không".

- **Sai nước = chết** (giống triết lý flappy/snake): nếu argmax trỏ vào hướng VÔ HIỆU
  (bị chặn, không làm đổi bàn cờ) thì ván kết thúc ngay. AI dùng 4 cờ "hướng đi được"
  trong input để HỌC cách tránh. Đây vừa là nguồn của đường học đi lên rõ rệt, vừa **bắt
  buộc để tránh lỗi kẹt vô hạn**: mạng nơ-ron tất định, nếu chỉ "bỏ qua nước vô hiệu" thì
  nó chọn mãi đúng hướng bị chặn đó (bàn cờ không đổi → input không đổi) và ván không bao
  giờ kết thúc — cả quần thể đứng board, thế hệ chỉ dừng khi chạm trần 8000 tick. Flappy/
  Snake không gặp lỗi này vì trạng thái của chúng luôn tự tiến (trọng lực / rắn luôn bò).
- **Reward mỗi nước** = +1 sống sót + điểm gộp ô được/4 — sống lâu (chọn nhiều nước hợp
  lệ) và gộp được ô to đều tăng fitness.
- **Score hiển thị** = **ô lớn nhất từng đạt được** (2, 4, 8, … 2048) — tăng theo NẤC.
  Test thực tế (die-on-invalid): qua 25 thế hệ, fitness trung bình **15 → 359** (đường
  học đi lên rõ, thế hệ đầu bấm bừa vào tường chết sớm), ô lớn nhất leo **64 → 256 → 512**.
  Mỗi thế hệ kết thúc tự nhiên trong ~50–360 tick (không còn bị treo tới 8000 tick).
- **Hiển thị 1 con tốt nhất**: khác Flappy/Snake không chồng N bàn cờ mờ (chồng nhiều
  bàn 2048 khác nhau vô nghĩa) — `render` chỉ vẽ ở mode `'full'`, tức chỉ con giỏi nhất.
  Bên dưới **vẫn chạy đủ N cá thể** bình thường.
- **Tile mới sinh theo seed** nên cả quần thể mỗi thế hệ đối mặt chuỗi tile giống hệt
  nhau — so fitness công bằng.
- Không gộp dây chuyền: `[2,2,2,2]` đi trái ra `[4,4,0,0]`, không phải `[8,0,0,0]`
  (đúng luật 2048 gốc — mỗi ô chỉ gộp tối đa 1 lần/nước đi).

## Hill Climb Racing — điều khiển liên tục + cơ chế "lật xe"

Khác Snake/2048 (chọn 1 trong N hành động rời rạc), Hill Climb Racing dùng **2 output
LIÊN TỤC 0..1** (ga, phanh) làm cường độ ga/phanh trực tiếp — không threshold, gần với
cách người chơi thật đạp ga bao nhiêu %.

**Đơn giản hoá có chủ đích**: xe không mô phỏng va chạm/rơi tự do đầy đủ như vật lý
thật — trục xe luôn bám theo độ cao địa hình, chỉ riêng **góc nghiêng thân xe** là bậc
tự do được mô phỏng (lò xo kéo thân xe về đúng góc mặt đường khi bánh còn bám; ga tạo
mô-men ngóc đầu lên, phanh tạo mô-men ngược lại). Đây là cách giữ đúng MỘT cơ chế học
thú vị nhất của game gốc (ga quá tay trên dốc → lật ngửa) mà không cần dựng cả engine
vật lý 2D.

- **Rủi ro lật có thật nhưng không chắc chắn**: test full-ga-liên-tục trên 20 địa hình
  ngẫu nhiên khác nhau → lật ở 8/20 (40%), số còn lại tự ổn định quanh góc nghiêng
  70–80°. Đúng tinh thần "chơi ẩu thì thường trót lọt nhưng thỉnh thoảng ăn quả đắng".
- **Phanh là công cụ cứu nguy thật sự**: đã kiểm chứng — xe nghiêng 27° dùng phanh gấp
  hạ về -33° mà không lật (không còn hiện tượng phanh quá tay tự gây lật ngược hướng
  như bản tune đầu tiên).
- **Reward** = quãng đường tiến được mỗi tick (lùi không thưởng nhưng không phạt) —
  dày mỗi tick như các game khác, tổng dồn xấp xỉ chính "quãng đường đi được".
- **Score hiển thị** = quãng đường (mét). Test thực tế: fitness trung bình từ 131 (gen 1)
  lên hàng chục nghìn chỉ sau vài thế hệ, quãng đường tốt nhất chạm ~2500m — mức trần
  này do giới hạn số tick/thế hệ (`maxStepsPerGen` mặc định 8000) chứ không phải do
  hết khả năng học.

## Cờ Tướng — AI học đánh giá thế cờ

Đây là ví dụ cắm game có **không gian hành động biến thiên** (mỗi thế cờ số nước đi
khác nhau) — không thể cho mạng nơ-ron xuất trực tiếp "nước đi" như Flappy. Cách giải:

- **NN KHÔNG chọn nước.** Việc tìm nước vẫn do **minimax** lo (thư viện xiangqi.js lo
  toàn bộ luật: sinh nước hợp lệ, chiếu, chiếu bí, hoà). Mạng nơ-ron chỉ **thay hàm
  đánh giá thế cờ** (chấm điểm một thế cờ tốt/xấu cỡ nào). Genome = trọng số mạng đó.
- **Mỗi cá thể là AI cầm Đỏ**, đấu **leo thang**: thắng bot cấp 1 thì ván sau đấu cấp 2,
  cứ thế; thua/hoà thì dừng. `Score` hiển thị = **cấp bot cao nhất đã hạ**.
- **Fitness** (xem công thức có comment trong [environment.js](js/xiangqi/environment.js)):
  điểm nền theo thắng/hoà/thua **+** thưởng lớn theo cấp đã thắng **−** số nước (thắng
  nhanh được thưởng). Khi thua, thưởng nhẹ theo số nước cầm cự — để thế hệ đầu vẫn có
  hướng cải thiện.

### Hai giai đoạn học (quan sát trên 2 biểu đồ)

Giống Snake, Cờ Tướng lộ 2 giai đoạn — nhìn biểu đồ **fitness** so với **Cấp bot đã thắng**:

1. Fitness trung bình nhích lên nhưng **cấp thắng vẫn kẹt ở 0–1**: AI mới học "không thua
   nhanh / thắng nổi bot cấp 1 (đi gần như ngẫu nhiên)".
2. **Cấp thắng bắt đầu leo 1 → 2 → 3…**: AI đã học đánh giá thế cờ đủ tốt để hạ bot mạnh
   dần (bot cấp cao nhìn xa hơn bằng minimax sâu hơn). Test thực tế: qua ~25 thế hệ,
   best fitness 950 → 2400, cấp thắng cao nhất 1 → 3.

### Thông số riêng (hiện khi chọn Cờ Tướng)

- **Độ sâu minimax (NN)**: 1 tầng (nhanh, mặc định) hoặc 2 tầng (chậm hơn ~3×, mạnh hơn).
  Để thấp vì mỗi thế hệ phải chơi hàng chục ván.
- **Cấp bot khởi điểm**: bắt đầu leo thang từ cấp mấy (mặc định 1).

### Đề xuất số (Cờ Tướng nặng hơn Flappy nhiều)

- **Quần thể 20–40** (mặc định tự đặt 30). Mỗi cá thể phải chơi CẢ VÁN cờ nên đừng để 100.
- **Node ẩn 10–16** (mặc định 12) — thế cờ phức tạp hơn Flappy.
- **Tốc độ để x1.** Mỗi thế hệ ~1 giây; kéo tốc độ cao sẽ chạy nhiều thế hệ/khung hình
  và làm treo trình duyệt vài giây.
- **Trần 100 nước/ván** (đã đặt sẵn trong code) để ván bất phân không kéo dài vô tận.

### Kiểm tra luật cờ riêng

Mở [xiangqi-test.html](xiangqi-test.html) bằng Live Server để chơi **người vs bot** (chọn
cấp 1–7), kiểm tra luật đi/ăn/chiếu/chiếu bí đúng chưa — tách biệt hoàn toàn UI chính.

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
