---
name: add-game
description: Cắm thêm một game (environment) mới vào Neuroevolution Lab. Dùng khi người dùng muốn "thêm game mới", "tạo environment mới", "add a new game/environment", hoặc mô tả một trò chơi để AI học chơi. Skill lo trọn: chốt spec, kiểm tra trùng với game cũ, tạo file environment đúng interface, đăng ký vào registry, verify, rồi viết 2 tài liệu (introduce + improve) theo đúng khuôn các game cũ.
---

# Cắm thêm game mới vào Neuroevolution Lab

Mục tiêu: thêm một environment mới sao cho **không đụng vào `ga.js`, `nn.js`, `main.js`,
`ui.js`** — chỉ tạo 1 file environment + 1 dòng registry + 2 file doc. Đây là hợp đồng
kiến trúc của repo (xem `CLAUDE.md`), skill này phải giữ đúng.

Làm tuần tự 6 bước. Đừng bỏ bước "kiểm tra trùng" (bước 2) — nó quyết định chọn khuôn mẫu
nào và tránh tạo ra bản sao của game đã có.

## Bước 1 — Chốt spec của game

Đọc `js/environments/flappy.js` (interface được mô tả kỹ ở block đầu file) rồi thu thập đủ
các thông tin sau. Thiếu cái nào thì hỏi người dùng, có gợi ý mặc định hợp lý:

- **`key`** (định danh trong registry, vd `pong`, `lunar`) và **`name`** (tên hiển thị, vd `Pong`).
- **Giác quan → `inputs`**: liệt kê từng số AI "nhìn thấy", **đã chuẩn hoá 0..1** (bắt buộc —
  xem lý do ở mục 2 doc introduce của flappy: tanh bão hoà ngoài [-3,3]). Ưu tiên
  *feature engineering* các hiệu số quan trọng (như "lệch khe" của Flappy, "mồi trước/sau"
  hệ quy chiếu tương đối của Snake) thay vì đưa toạ độ thô.
- **Hành động → `outputs`** và **cách diễn giải output**. Chọn 1 trong 3 khuôn (xem bước 2):
  - **Ngưỡng** (Flappy): 1 output, `> 0.5` = làm hành động.
  - **Argmax** (Snake, 2048): N output = N hành động rời rạc, chọn output lớn nhất.
  - **Hàm lượng giá + tìm kiếm** (Cờ Tướng): 1 output = "thế này tốt cỡ nào", môi trường
    tự chạy minimax/expectimax dùng mạng làm hàm chấm điểm (cần `attachNetwork`).
- **Reward**: thưởng/phạt mỗi tick + sự kiện. Nhớ tương quan độ lớn giữa "sống sót" và
  "mục tiêu chính" (đọc kỹ comment reward của flappy — đây là chỗ dễ hỏng việc học nhất).
- **`done`**: khi nào ván kết thúc.
- **`scoreLabel` + `getScore()`**: con số người xem hiểu ngay (số ống, mồi, ô lớn nhất…),
  **khác** fitness (tổng reward). Score dùng cho biểu đồ + lịch sử.
- **Render**: vẽ gì trong `mode 'full'` (cả cảnh + 1 agent đại diện) và `'agent'` (chỉ agent,
  chồng lên). Toạ độ logic = canvas 480×600.
- **Ngẫu nhiên?** Nếu map/state có yếu tố ngẫu nhiên, PHẢI seed được (dùng `mulberry32` như
  các env khác) — mọi cá thể cùng thế hệ phải gặp map y hệt nhau để so fitness công bằng.
- **Option đổi kiến trúc?** (tuỳ chọn) nếu game có tham số đổi số input/output (như
  `lookahead` của Flappy, `searchDepth` của 2048) thì cần `configFor(opts)` — xem bước 4.

## Bước 2 — Kiểm tra trùng với game cũ (đừng bỏ)

Đối chiếu spec vừa chốt với 5 game hiện có. Mục đích kép: **chọn khuôn gần nhất để nhân bản**
và **cảnh báo nếu game mới gần như trùng** một game cũ.

| Game | inputs | outputs | Khuôn hành động | Cơ chế lõi |
|------|--------|---------|-----------------|------------|
| Flappy | 4 (×lookahead) | 1 | Ngưỡng >0.5 | 1 hành động, tránh vật cản trôi tới |
| Snake | 6 | 3 | Argmax | 4 hướng (hệ tương đối), chủ động tìm mồi, cơ chế đói |
| 2048 | 20 (+mẹo) | 4 hoặc 1 | Argmax / expectimax | lưới 4×4, gộp ô, action masking |
| Hill Climb | xem file | — | — | điều khiển xe trên địa hình |
| Cờ Tướng | 14 | 1 | Hàm lượng giá + minimax | mỗi step = cả ván cờ, leo thang bot |

Cách làm:
1. `grep -n "static config" js/environments/*.js js/xiangqi/environment.js` và đọc `config`
   của từng game để lấy số liệu chính xác (bảng trên là mốc nhanh, luôn kiểm tra lại file).
2. Xác định game mới **giống khuôn nào nhất** (khuôn hành động + có ngẫu nhiên/seed không +
   có tìm kiếm không). Nhân bản file đó làm điểm khởi đầu — sẽ đỡ việc nhất.
3. **Nếu game mới gần như trùng** một game cũ (cùng khuôn hành động + cùng loại cơ chế lõi,
   vd "lại một game lưới 4 hướng đi tìm mục tiêu" ≈ Snake): NÊU RÕ cho người dùng điểm khác
   biệt thực chất là gì, và hỏi xem có muốn (a) tiếp tục vì điểm khác biệt đủ thú vị, hay
   (b) điều chỉnh spec cho khác hẳn. Đừng lặng lẽ tạo bản sao.
4. Ghi lại kết luận: "dùng `<game cũ>.js` làm khuôn, khác ở …" — sẽ dùng khi viết doc.

## Bước 3 — Tạo file environment

Chép `templates/environment.js` (trong thư mục skill này) thành `js/environments/<key>.js`,
hoặc nhân bản game-khuôn đã chọn ở bước 2, rồi điền theo spec. Bắt buộc:

- Comment/docstring **tiếng Việt**, giải thích *why* không phải *what*, đúng mật độ lý lẽ như
  các env cũ (xem `CLAUDE.md` mục quy ước ngôn ngữ).
- Giữ nguyên block "INTERFACE CHUNG" ở đầu file (trỏ về flappy.js) để nhất quán.
- `static config = { name, inputs, outputs, inputLabels, outputLabels, scoreLabel }`.
- `reset(seed)` / `getInputs()` (trả mảng đã chuẩn hoá 0..1) / `step(outputs)` (trả
  `{ reward, done }`) / `render(ctx, mode)`.
- `getScore()` trả metric hiển thị.
- Nếu có ngẫu nhiên: copy hàm `mulberry32` và seed trong `reset`.
- Nếu là khuôn "hàm lượng giá + tìm kiếm": thêm `attachNetwork(net)` (Trainer gọi để đưa mạng
  vào — xem `js/xiangqi/environment.js` và `js/ga.js` chỗ gọi `attachNetwork`).

## Bước 4 — Đăng ký vào registry

Thêm vào `js/environments/registry.js`: 1 dòng `import` + 1 entry. Chọn đúng dạng:

```js
// Game thường (không đổi kiến trúc theo option):
snake: { config: SnakeEnv.config, create: () => new SnakeEnv() },

// Game có option đổi số input/output (cần configFor tĩnh trong class + factory nhận opts):
'2048': {
  config: Game2048Env.config,
  configFor: (opts) => Game2048Env.configFor(opts),
  create: (opts) => new Game2048Env(opts),
},
```

Nếu game có `configFor` (đổi độ dài gen theo option), phải thread option đó qua `main.js`
(`resolveEnv` → `envOptions`) và qua `storage.js` (`archOf`/`archId`) để lịch sử phân biệt
đúng các genome không tương thích. Xem cách `lookahead`/`searchDepth` đã làm.

## Bước 5 — Verify (bắt buộc, đừng chỉ đọc code)

1. **Cú pháp**: chạy thử một mô phỏng headless bằng Node (import environment như một `.mjs`,
   quay vòng `getInputs → forward giả → step` vài nghìn tick với output ngẫu nhiên, in ra
   `score`/`done`). Xác nhận không văng lỗi và ván có kết thúc được (không kẹt vô hạn).
   Xem tiền lệ: các lần verify env trong lịch sử repo dùng mẫu này. Nhớ copy `nn.js` thành
   `.mjs` nếu cần mạng thật.
2. **Trình duyệt**: chạy static server (`python3 -m http.server`), mở headless
   (`--dump-dom` / `--enable-logging=stderr`), chọn game mới trong dropdown, xác nhận **không
   có lỗi console** và canvas vẽ được. Dropdown tự sinh từ registry nên game mới phải xuất
   hiện sẵn.
3. Dọn mọi file tạm sau khi verify.

## Bước 6 — Viết 2 tài liệu (theo đúng khuôn game cũ)

Đọc `docs/introduce/flappy-bird.md` và `docs/improve/flappy-bird.md` làm mẫu chuẩn, rồi viết:

### `docs/introduce/<key>.md` — giải thích thuật toán HIỆN TẠI

Giải thích *toàn bộ logic* của game mới, bám cấu trúc file introduce của Flappy:
1. Một cá thể gồm gì (`{ net, env, fitness, alive }`, gen = trọng số phẳng).
2. Giác quan — giải thích TỪNG input, vì sao chuẩn hoá, chỗ nào là feature engineering.
3. Cách diễn giải output → hành động (ngưỡng/argmax/lượng giá), yếu tố nào chi phối quyết định.
4. Reward — định hình "gen tốt" nghĩa là gì; nêu rõ tương quan độ lớn các thành phần và
   cảnh báo reward-hacking nếu có.
5. Vòng lặp một thế hệ (nhắc lại từ `ga.js`, ngắn gọn).
6. Điểm thú vị để quan sát của riêng game này (như "2 giai đoạn học" của Snake, "nấc ô lớn"
   của 2048) — nếu có.
Dùng link tương đối tới file code (`../../js/environments/<key>.js`), chèn số dòng khi trỏ
tới đoạn cụ thể. Văn phong tiếng Việt, giải thích cặn kẽ như bản Flappy.

### `docs/improve/<key>.md` — đề xuất cải tiến

Danh sách đề xuất, mỗi mục theo khuôn của `docs/improve/flappy-bird.md`:

```
## <n>. <Tên đề xuất>
**Hiện tại**: <điểm yếu/giới hạn hiện thời, trỏ tới code cụ thể>
**Cải thiện**: <đề xuất, kèm đoạn code nếu ngắn gọn>
**Giá**: <nhỏ / trung bình / lớn — công sức & rủi ro>
```

Mỗi đề xuất phải bám vào code THẬT của game mới (giới hạn quan sát được ở bước 5), không nói
chung chung. Ưu tiên các hướng đã có tiền lệ trong repo (annealing đột biến, crossover theo
neuron, reward shaping cẩn thận, recurrent, curriculum, feature engineering thêm input,
tìm kiếm sâu hơn) nhưng diễn giải riêng cho game này. Mục nào đã làm rồi thì đánh dấu `✅ ĐÃ LÀM`.

## Chốt lại

Báo cáo cho người dùng: file environment đã tạo, kết luận kiểm tra trùng (dùng khuôn nào,
khác gì), kết quả verify (số liệu mô phỏng headless + "không lỗi console"), và 2 đường dẫn
doc. Chưa commit trừ khi người dùng yêu cầu.
