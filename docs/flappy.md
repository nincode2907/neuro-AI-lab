# Flappy Bird — Full logic của thuật toán học (Neuroevolution + GA)

> Tài liệu này giải thích **toàn bộ logic** đằng sau con chim AI trong
> [flappy.js](../js/environments/flappy.js), kết hợp với bộ não
> [nn.js](../js/nn.js) và thuật toán tiến hoá [ga.js](../js/ga.js).
> Đây không phải reinforcement learning kiểu Q-learning/backprop — đây là
> **neuroevolution**: quần thể mạng nơ-ron ngẫu nhiên tiến hoá qua chọn lọc
> tự nhiên, không có gradient, không có "đúng/sai" cho từng hành động, chỉ có
> **sống lâu hơn = gen tốt hơn**.

---

## 1. Một cá thể (individual) gồm những gì?

Mỗi cá thể trong quần thể là một object (`ga.js:_makeIndividual`):

```js
{ net, env, fitness, alive }
```

| Thành phần | Ý nghĩa |
|---|---|
| `net` | Một `NeuralNetwork` — "bộ não" riêng, kiến trúc `[4, hiddenNodes, 1]` |
| `env` | Một `FlappyEnv` **riêng** (không dùng chung env cho cả bầy) |
| `fitness` | Tổng reward cộng dồn cả đời — thước đo GA dùng để xếp hạng |
| `alive` | Còn sống ở tick hiện tại hay đã va chạm/hết giờ |

Điểm quan trọng: **gen của cá thể = toàn bộ trọng số + bias của mạng, trải
phẳng thành một mảng số** (`nn.js: getGenes()/setGenes()`). Không có gen nào
mã hoá "luật chơi" — luật chơi nằm cứng trong `flappy.js`. Cái GA tiến hoá là
**cách con chim phản ứng với 4 con số giác quan**, không phải luật vật lý.

Kiến trúc mạng cố định trong suốt một lần chạy: số input/output do game quyết
định (4 → 1), chỉ có `hiddenNodes` (số node lớp ẩn) là tham số người dùng
chỉnh — xem mục 5.

---

## 2. Giác quan — 4 input quyết định con chim "nhìn thấy" gì

`FlappyEnv.getInputs()` (flappy.js:136-158) mặc định (lookahead=1) trả về 4
số, **luôn chuẩn hoá về khoảng 0..1**:

1. **Độ cao chim**: `birdY / H` — 0 = sát trần, 1 = sát đất. Giữ nguyên dạng
   TUYỆT ĐỐI (không trừ gì cả) — làm "lưới an toàn" để tránh chạm trần/đất
   kể cả lúc không có ống nào gần để so.
2. **Vận tốc rơi**: `(birdVy + MAX_VY) / (2*MAX_VY)` — 0.5 = đứng yên,
   càng nhỏ càng đang bay lên nhanh, càng lớn càng rơi nhanh.
3. **Khoảng cách ngang tới ống tiếp theo**: `(pipe.x - BIRD_X) / W` — 0 =
   ống đang ở ngay chỗ chim, 1 = ống còn rất xa.
4. **Lệch khe hở**: `0.5 + (birdY - pipe.gapY) / H` — KHÔNG phải vị trí
   tuyệt đối của khe hở, mà là **hiệu số đã chuẩn hoá** giữa độ cao chim và
   tâm khe. `0.5` = chim đang ngang đúng tâm khe, `<0.5` = chim đang **ở
   trên** khe (nên để rơi thêm), `>0.5` = chim đang **ở dưới** khe (nên
   nhảy). Đây là ví dụ **feature engineering**: thay vì đưa 2 số thô (độ cao
   chim, vị trí khe) rồi bắt mạng tự học phép trừ qua lớp ẩn tanh, ta đưa
   thẳng kết quả phép trừ vào — tín hiệu quan trọng nhất gần như đã "chín"
   sẵn trong 1 input, mạng chỉ cần học ngưỡng quanh 0.5 thay vì học cả một
   phép toán. (Tuỳ chọn "Số ống nhìn trước" trên UI có thể tăng lookahead
   lên 2-3, mỗi ống thêm góp 2 input [k/c ngang, lệch khe] kiểu này — xem
   flappy.js: `configFor()`.)

Con chim **không hề biết** tốc độ ống trôi (hằng số `PIPE_SPEED`, không đưa
vào input), không biết điểm số. Nó chỉ phản xạ theo các con số này ở đúng
khoảnh khắc hiện tại — giống một stimulus–response mapping thuần tuý, không
có trí nhớ (mạng feedforward, không có recurrent state).

**Vì sao chuẩn hoá 0..1 quan trọng**: mạng ẩn dùng `tanh` — bão hoà ngoài
khoảng [-3, 3]. Nếu để input thô (ví dụ `birdY` chạy 0..600), một trọng số
ngẫu nhiên nhỏ ban đầu (Xavier-init, `nn.js:39`) sẽ đẩy `sum` vào vùng bão hoà
ngay từ thế hệ đầu, gradient tiến hoá (tức là "độ nhạy của fitness với thay
đổi gen nhỏ") gần như biến mất. Chuẩn hoá giữ input cùng thang đo giúp một
mạng nhỏ (8-12 node ẩn) học được mà không cần lớp batch-norm nào.

---

## 3. Quyết định "nhảy hay không" — cái gì thực sự chi phối nó

Output của mạng chỉ có **1 số** (sigmoid, luôn 0..1):

```js
if (outputs[0] > 0.5) this.birdVy = FLAP_VY;   // flappy.js:119
```

Ngưỡng `0.5` là **hardcode**, không tiến hoá. Cái tiến hoá là **hàm map từ
input → xác suất vượt ngưỡng 0.5**, tức là toàn bộ trọng số/bias của mạng.

Cụ thể, quyết định nhảy hay không tại một tick phụ thuộc vào 3 lớp yếu tố,
theo thứ tự từ "quyết định nhiều nhất" đến "tinh chỉnh":

1. **Lệch khe hở (input 4)** — gần như là tín hiệu quan trọng nhất, và vì đã
   được feature-engineer sẵn (mục 2), quy tắc tối ưu gần đúng gần như đọc
   thẳng ra được: "lệch khe > 0.5 (chim ở dưới khe) → nhảy; < 0.5 (chim ở
   trên khe) → đừng nhảy, để trọng lực kéo xuống". Một mạng học tốt về cơ
   bản chỉ cần học được một ngưỡng quanh giá trị này.
2. **Vận tốc rơi hiện tại (input 2)** — bổ sung yếu tố "quán tính": mạng tốt
   học được rằng nhảy khi đang rơi rất nhanh sẽ hiệu quả hơn nhảy khi đã gần
   đứng yên, tránh dao động lên-xuống liên tục (dễ va trần hoặc quá đà).
3. **Khoảng cách ngang tới ống (input 3)** — quyết định *cần quan tâm khe hở
   ống tới mức nào ngay bây giờ*. Khi ống còn xa (`input3` gần 1), hành vi
   tối ưu gần giống "bay ở giữa màn hình, chờ"; khi ống đến gần (`input3` gần
   0), việc canh khe hở trở nên gấp rút, trọng số tương ứng cần "kích hoạt
   mạnh" lớp ẩn ở thời điểm này.
4. **Độ cao tuyệt đối (input 1)** — hiếm khi quyết định chính, chỉ can thiệp
   khi chim gần chạm trần/đất (lệch khe không tự bảo vệ khỏi 2 biên này).

Vì mạng chỉ có 1 lớp ẩn nhỏ và không có bộ nhớ, hành vi học được thực chất là
một **mặt quyết định (decision boundary) phi tuyến** trong không gian nhiều
chiều, xấp xỉ luật trên — không có "chiến lược dài hạn" nào được lưu trữ giữa
các tick ngoài các con số tức thời.

---

## 4. Phần thưởng (reward) — thứ định hình "gen tốt" nghĩa là gì

`FlappyEnv.step()` (flappy.js:136-161):

- **+1 mỗi tick sống sót.**
- **+100 mỗi khi vượt qua một ống** (mép phải ống lọt qua khỏi thân chim).
- **`done = true`** (chết, không cộng gì thêm) khi: chạm trần/đất, hoặc thân
  chim nằm trong dải x của ống mà lệch ra ngoài khe hở.

`fitness` của một cá thể = **tổng reward cộng dồn suốt đời** (`ga.js:105`),
không phải reward trung bình, không chiết khấu theo thời gian (no discount
factor) — sống lâu gấp đôi thì phần "+1/tick" gấp đôi, cộng dồn tuyến tính.

**Vì sao 100 so với 1**: đây là quyết định thiết kế fitness quan trọng nhất
của cả hệ thống, đọc kỹ comment ở flappy.js:137-139. Nếu chỉ thưởng sống sót
(không có +100), một chiến lược "bay lơ lửng an toàn ở giữa màn hình rồi tình
cờ chết ngay trước ống thứ nhất" có fitness gần bằng "cố vượt ống nhưng chết
ngay sau đó" — GA sẽ không phân biệt được ai giỏi hơn về mặt *mục tiêu thật
sự của trò chơi* (vượt ống), chỉ tối ưu "sống lâu" một cách thụ động. Ngược
lại, nếu +100 quá nhỏ so với thời gian sống trung bình giữa hai ống
(~`PIPE_SPACING / PIPE_SPEED` = 100 tick), tín hiệu "vượt ống" bị chìm trong
nhiễu "sống lâu". Ở đây 100 >> 100 tick × 1 reward/tick khiến việc vượt ống
luôn là cú nhảy fitness áp đảo — đúng ý đồ: **"sống sót" chỉ để phân biệt các
cá thể chết sớm ở thế hệ đầu (khi chưa ai vượt nổi ống nào), còn "vượt ống"
mới là mục tiêu chính khi quần thể đã trưởng thành.**

⚠️ **Điều cần chú ý khi chỉnh sửa reward**: đây là điểm dễ phá vỡ việc học
nhất nếu bạn thử nghiệm. Reward-shaping sai (ví dụ thưởng thêm cho "bay gần
tâm khe hở" ở mọi tick) có thể vô tình dạy AI một hành vi phụ không phải mục
tiêu thật (reward hacking) — ví dụ AI học cách dao động quanh tâm khe hở dù
chưa có ống nào gần, thay vì tối ưu vượt ống.

---

## 5. Vòng lặp một thế hệ (nhắc lại từ ga.js)

```
1. Sinh N cá thể, mỗi cá thể một NeuralNetwork trọng số ngẫu nhiên (Xavier-init).
2. resetEnvs(): TẤT CẢ N env reset với CÙNG MỘT seed ngẫu nhiên (mulberry32).
   => dàn ống giống hệt nhau cho cả quần thể trong thế hệ này.
3. Mỗi tick (stepAll()):
     inputs = env.getInputs()
     outputs = net.forward(inputs)
     {reward, done} = env.step(outputs)
     fitness += reward
   Lặp tới khi mọi cá thể done, hoặc chạm maxStepsPerGen (bất tử -> ép dừng).
4. onGenerationEnd(): cộng dồn fitness của dàn ống vừa chơi. Nếu chưa đủ
   `seedsPerGen` dàn (mặc định 1) -> resetEnvs() với SEED KHÁC, net giữ
   nguyên, quay lại bước 2 (CHƯA tiến hoá). Đủ rồi -> fitness = trung bình
   cộng qua các seed -> evolve(): xếp hạng -> elitism + selection + crossover
   + mutation -> quần thể mới -> quay lại bước 2 với generation + 1.
```

**Vì sao seed phải giống nhau trong một thế hệ** (mulberry32, flappy.js:19-28):
đây là điều kiện tiên quyết để so sánh fitness công bằng. Nếu mỗi cá thể gặp
dàn ống khác nhau (một con gặp khe hở dễ, một con gặp khe hở khó), fitness
cao có thể chỉ vì "may mắn" chứ không phải gen tốt hơn — GA sẽ chọn nhầm cha
mẹ. Seed **được đổi mới mỗi thế hệ** (`ga.js:80`, `Math.random()` mới mỗi lần
`_resetEnvs()`), nên qua nhiều thế hệ, cá thể vẫn phải tổng quát hoá được với
nhiều dàn ống ngẫu nhiên khác nhau chứ không học thuộc lòng một màn cụ thể.

**Giới hạn của "1 seed/thế hệ" và tuỳ chọn `seedsPerGen`:** ngay trong MỘT
thế hệ, xếp hạng vẫn công bằng (ai cũng gặp dàn ống y hệt), nhưng dàn ống đó
tự nó có thể dễ hoặc khó một cách ngẫu nhiên. Một cá thể "ăn may" gặp seed dễ
có thể leo lên elite dù không tổng quát hoá tốt bằng cá thể khác vừa xui gặp
seed khó — gen kém tổng quát đó vẫn được nhân giống, và đường best trên biểu
đồ nhấp nhô một phần lớn chỉ vì độ khó seed đổi qua từng thế hệ, không hẳn vì
quần thể giỏi lên/xuống. Bật `seedsPerGen` > 1 (UI: "Số dàn ống / thế hệ",
đọc trong `ui.js`/`main.js`) để mỗi cá thể chơi 2-3 dàn ống khác nhau trước
khi tiến hoá — `onGenerationEnd()` trong `ga.js` cộng dồn fitness từng dàn
vào `ind.fitnessAccum`, tới dàn cuối mới chia trung bình rồi mới gọi
`evolve()`. Đổi lại: mỗi thế hệ chạy chậm hơn N lần (N = seedsPerGen).

---

## 6. Thuật toán chọn lọc thế hệ tiếp theo (chi tiết `evolve()`)

### 6.1. Elitism — giữ nguyên vài con giỏi nhất

```js
for (let i = 0; i < eliteCount; i++) {
  newPop.push(_makeIndividual(ranked[i].net.clone()));
}
```

`eliteCount` cá thể xếp hạng cao nhất được **sao chép y nguyên** (không lai
ghép, không đột biến) sang thế hệ sau. Đảm bảo tính chất **monotonic**: best
fitness của thế hệ sau không bao giờ *thấp hơn* thế hệ trước (vì bản sao y
hệt của nhà vô địch luôn còn đó). Đây là cơ chế chống "quên" — không có
elitism, một đột biến xui rủi có thể xoá sạch chiến thuật tốt nhất vừa tìm ra.

### 6.2. Tournament selection — chọn cha mẹ

```js
_select(ranked, k = 5) {
  let best = null;
  for (let i = 0; i < k; i++) {
    const cand = ranked[(Math.random() * ranked.length) | 0];
    if (!best || cand.fitness > best.fitness) best = cand;
  }
  return best;
}
```

Bốc ngẫu nhiên `k=5` cá thể từ TOÀN BỘ quần thể (không loại trừ ai), lấy con
**giỏi nhất trong nhóm bốc được** làm cha (hoặc mẹ). Gọi hai lần độc lập để
lấy `parentA` và `parentB` (có thể trùng nhau).

Đây là cơ chế **chọn lọc có áp lực (selection pressure) nhưng không tuyệt
đối**: một cá thể fitness thấp vẫn có cơ hội được chọn nếu nó "may mắn" không
bị ai giỏi hơn lọt vào nhóm bốc của nó — xác suất đó giảm dần khi `k` tăng.
Điều này **cố ý giữ đa dạng gen (genetic diversity)**, tránh hội tụ sớm về
một chiến thuật (premature convergence).

### 6.3. Uniform crossover — lai ghép gen

```js
child[i] = Math.random() < 0.5 ? genesA[i] : genesB[i];
```

Mỗi gen (từng trọng số/bias riêng lẻ, không phải theo "khối") của con được
lấy 50/50 ngẫu nhiên độc lập từ cha hoặc mẹ. Đây là **uniform crossover**,
khác với "single-point crossover" (cắt gen thành 2 đoạn liền). Uniform
crossover trộn gen mạnh tay hơn, tạo đa dạng tổ hợp nhanh hơn, nhưng cũng dễ
phá vỡ các "khối gen phối hợp tốt với nhau" (building blocks / co-adapted
gene complexes) hơn single-point — vì hai trọng số liên quan chặt (ví dụ một
neuron ẩn cụ thể) có thể bị tách ra từ hai cha mẹ khác nhau, làm mất ý nghĩa
phối hợp ban đầu của chúng.

### 6.4. Gaussian mutation — đột biến

```js
if (Math.random() < mutationRate) genes[i] += randGaussian(0, 0.5);
```

Mỗi gen của con (sau crossover) có xác suất `mutationRate` bị cộng thêm nhiễu
Gauss (trung bình 0, độ lệch chuẩn 0.5). Đây là **nguồn duy nhất sinh ra giá
trị gen hoàn toàn mới** — crossover chỉ tổ hợp lại gen đã tồn tại trong quần
thể, không tạo giá trị mới. Không có đột biến, sau vài chục thế hệ quần thể
sẽ hội tụ về một tập giá trị gen hữu hạn và ngừng tiến bộ hoàn toàn (mất khả
năng khám phá — loss of exploration).

---

## 7. Các tham số quan trọng và ảnh hưởng khi tinh chỉnh

| Tham số | Vị trí | Tăng thì sao? | Giảm thì sao? |
|---|---|---|---|
| **`popSize`** (N) | UI: 10–500, mặc định 100 | Nhiều chiến thuật thử song song mỗi thế hệ → ít kẹt cực trị cục bộ, nhưng mỗi thế hệ chạy chậm hơn (tuyến tính theo N) | Chạy nhanh hơn nhưng dễ hội tụ sớm/kẹt vì mẫu gen ít đa dạng |
| **`mutationRate`** | UI: 0.01–0.5, mặc định 0.1 | Khám phá (exploration) mạnh hơn, thoát cực trị cục bộ tốt hơn, NHƯNG nếu quá cao sẽ phá gen tốt liên tục → đường fitness **dao động mạnh (volatility)**, khó hội tụ | Hội tụ ổn định hơn khi đã tìm ra hướng tốt, NHƯNG nếu quá thấp quần thể chỉ tổ hợp lại gen cũ → dễ **chững lại (plateau)** sớm |
| **`hiddenNodes`** | UI: 2–32, mặc định 8 | Mạng biểu diễn được decision boundary phức tạp hơn (hành vi tinh vi hơn), nhưng không gian gen lớn hơn → cần nhiều thế hệ/quần thể lớn hơn để lấp đầy | Học nhanh hơn ở giai đoạn đầu (không gian gen nhỏ, dễ dò), nhưng dễ "chạm trần" khả năng (underfitting hành vi) nếu game cần logic phức tạp hơn |
| **`eliteCount`** | ga.js constructor, mặc định 4 | Bảo toàn thành quả tốt chắc hơn, nhưng nếu quá lớn so với N → giảm tỉ lệ cá thể mới được lai ghép/đột biến, làm chậm khám phá, dễ kẹt vào chiến thuật elite hiện tại | Khám phá mạnh hơn nhưng dễ "đánh rơi" thành quả tốt nếu thế hệ mới toàn cá thể kém |
| **`k` (tournament size)** | ga.js:189, hardcode = 5 | Áp lực chọn lọc mạnh hơn (gần giống chỉ chọn top fitness) → hội tụ nhanh nhưng dễ hội tụ sớm, mất đa dạng | Áp lực chọn lọc yếu hơn → giữ đa dạng gen tốt hơn nhưng hội tụ chậm hơn |
| **`maxStepsPerGen`** | ga.js constructor, mặc định 8000 tick | Cho phép cá thể giỏi sống lâu hơn trước khi bị ép dừng (quan trọng khi AI đã giỏi tới mức "bất tử") | Thế hệ xoay vòng nhanh hơn (nhiều thế hệ/phút) nhưng có thể cắt ngang cá thể đang chơi tốt, làm fitness bị đánh giá thấp hơn thực lực |
| **Tỉ lệ reward sống-sót/vượt-ống** (1 vs 100) | flappy.js:140,159, hardcode | Chỉnh tỉ lệ này thay đổi HẲN mục tiêu tối ưu — xem mục 4 | — |

### Ghi chú thực nghiệm (đã cài sẵn trong `analysis.js`)

Dự án có sẵn một bộ heuristic tự phân tích lịch sử huấn luyện
(`analyzeRun()` trong [analysis.js](../js/analysis.js)) để gợi ý điều chỉnh,
đáng chú ý:

- **Đang tiến bộ** (fitness trung bình nửa cuối cao hơn nửa đầu >8%) → cứ để
  chạy tiếp, chưa cần đổi tham số.
- **Chững lại + mutationRate thấp (<0.2)** → gợi ý tăng đột biến để thoát cực
  trị cục bộ.
- **Chững lại + mutationRate cao (>0.25) và fitness dao động mạnh
  (volatility >0.4, đo bằng hệ số biến thiên của đường "best" qua các thế
  hệ)** → gợi ý giảm đột biến để hội tụ ổn định hơn.
- **Score chưa "cất cánh" (<3 ống) + hiddenNodes nhỏ (<16)** → gợi ý tăng gấp
  đôi node ẩn, vì có thể mạng quá nhỏ để biểu diễn hành vi cần thiết.
- **popSize nhỏ (<80) khi đã chững lại** → gợi ý tăng quần thể để có nhiều
  chiến thuật song song hơn.

Đây chính là bằng chứng thực nghiệm cho các quy luật ở bảng trên: **volatility
cao → giảm mutation; plateau + mutation thấp → tăng mutation; score thấp +
não nhỏ → tăng hiddenNodes; plateau + quần thể nhỏ → tăng popSize.**

---

## 8. Những điều cần đặc biệt chú ý (pitfalls)

1. **Seed phải nhất quán trong một thế hệ, nhưng đổi mới giữa các thế hệ**
   (đã đúng trong code) — sai một trong hai chiều này đều làm fitness không
   còn phản ánh đúng chất lượng gen.
2. **Cân bằng reward sống-sót vs mục tiêu chính** (mục 4) — đây là phần dễ bị
   phá nhất khi tuỳ chỉnh, vì hậu quả (reward hacking) không lộ ngay, chỉ
   thấy AI "học được một hành vi kỳ lạ" sau nhiều thế hệ.
3. **Mạng không có bộ nhớ (feedforward thuần, không recurrent)** — mọi quyết
   định chỉ dựa vào 4 input tại đúng tick đó. Nếu muốn hành vi phụ thuộc lịch
   sử (ví dụ "vừa nhảy 2 lần liên tiếp thì đừng nhảy nữa"), kiến trúc hiện tại
   không biểu diễn được trực tiếp — chỉ có thể xấp xỉ gián tiếp qua input
   vận tốc.
4. **`mutationRate` và `k` (tournament size) tương tác với nhau**: mutation
   cao + k cao (áp lực chọn lọc mạnh) cùng lúc dễ gây dao động cực mạnh (elite
   liên tục bị "vượt mặt" rồi "mất" ở thế hệ sau nếu không nhờ elitism).
   Thường chỉ nên chỉnh **một tham số một lần** rồi quan sát vài chục thế hệ,
   đúng như gợi ý trong `analysis.js:137`.
5. **`hiddenNodes` tăng làm không gian gen tăng theo bậc nhân** (mỗi node ẩn
   thêm 4 trọng số vào + 4 trọng số ra + 1 bias) — tăng node ẩn mà không tăng
   `popSize`/số thế hệ tương ứng thường phản tác dụng: không gian tìm kiếm
   lớn hơn nhưng số "phép thử" mỗi thế hệ không đổi.
6. **`maxStepsPerGen`** tồn tại để chặn trường hợp AI đã giỏi đến mức không
   bao giờ chết (vòng lặp mô phỏng sẽ treo vô hạn nếu không có chặn này) —
   đừng đặt quá thấp kẻo cắt ngang đánh giá đúng của cá thể giỏi, cũng đừng
   quá cao kẻo một thế hệ chạy quá lâu khi AI đã giỏi.
7. **Đo lường "học" phải nhìn cả 3 đường**: `best`, `avg`, và `score`
   (`ga.js:160`) — không chỉ nhìn `best`. `best` có thể tăng đột ngột do một
   cá thể may mắn; `avg` phản ánh chất lượng thật của cả quần thể; `score`
   (số ống vượt) là con số người xem hiểu trực quan nhưng khác thang đo với
   `fitness` (fitness cộng dồn cả reward sống sót).

---

## 9. Tóm tắt luồng dữ liệu end-to-end

```
FlappyEnv.reset(seed)                     [mọi cá thể cùng thế hệ, cùng seed]
        │
        ▼
getInputs() → [độ cao, vận tốc, k/c ống, lệch khe]   (4 số, 0..1 — lệch khe
                                                       = (birdY-gapY) đã chuẩn hoá)
        │
        ▼
NeuralNetwork.forward(inputs)             [tanh ẩn → sigmoid output]
        │
        ▼
outputs[0] > 0.5 ?  →  vỗ cánh : rơi tự do
        │
        ▼
FlappyEnv.step(outputs) → { reward, done }
        │
        ▼
fitness += reward   (lặp lại đến khi done, cộng dồn cho MỘT cá thể)
        │
        ▼  (khi CẢ quần thể done)
Trainer.evolve():
   ranked = sort theo fitness giảm dần
   newPop = [eliteCount bản sao nguyên vẹn của top]
          + lặp: tournament-select(cha) + tournament-select(mẹ)
                 → uniform-crossover → gaussian-mutation → cá thể mới
        │
        ▼
generation++ , resetEnvs(seed mới) , lặp lại
```
