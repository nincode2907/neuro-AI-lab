# 🧬 Neuroevolution Lab

Web app trực quan hoá quá trình **AI tự học chơi game bằng neuroevolution** (thuật toán di
truyền + mạng nơ-ron, không backpropagation). Không framework, không build step — HTML/CSS/JS
thuần chạy thẳng trên trình duyệt.

Xem cả quần thể AI (hàng chục tới hàng trăm cá thể) cùng chơi song song, chọn lọc tự nhiên
diễn ra qua từng thế hệ, và biểu đồ fitness/score đi lên theo thời gian thực.

## Game hỗ trợ

| Game | Mô tả ngắn |
|---|---|
| 🐦 Flappy Bird | 1 hành động (vỗ/không), nhìn trước 1–3 ống |
| 🐍 Snake | 4 hướng, có 2 giai đoạn học rõ rệt (né chết → săn mồi) |
| 🔢 2048 | 4 hướng, tuỳ chọn policy thuần hoặc expectimax 2–3 tầng + 4 "mẹo chiến thuật" |

Hill Climb và Cờ Tướng vẫn còn trong source để nghiên cứu, nhưng chưa được đăng ký trong
Public v1. Bản public tập trung hoàn thiện ba game trên trước.

Thêm game mới **không cần sửa** `ga.js`/`main.js`/`ui.js` — xem hướng dẫn ở đầu
[`js/environments/registry.js`](js/environments/registry.js).

## Chạy như thế nào

Không có bước cài đặt hay build. Cần chạy qua HTTP (không mở trực tiếp bằng `file://`) vì
dùng ES module:

```bash
# một trong các cách sau
npx serve .
npm start
# hoặc chỉ chạy static (không có Brain Hub API): python3 -m http.server 8000
# hoặc: chuột phải index.html trong VS Code → "Open with Live Server"
```

Mở trình duyệt, chọn game, chỉnh thông số, bấm **▶ Start**. Kéo tốc độ lên x50 để tua nhanh
việc học.

Giao diện mặc định là **Khám phá** để bắt đầu nhanh. Chuyển sang **AI Lab** để mở toàn bộ
hyperparameter, network graph, bảng gene, heatmap và biểu đồ phân tích.

## Brain file

Sau khi hoàn thành ít nhất một thế hệ, có thể **Xuất Brain** thành JSON, nhập lại trên máy
khác và tiến hoá tiếp. Brain chỉ chứa data, có schema/version/hash và gắn đúng genome với
score, fitness, generation cùng evaluation seeds của chính nó.

“Tiến hoá từ Brain” là warm start từ champion. Nó khác “resume checkpoint” vì không phục
hồi toàn bộ population và trạng thái RNG của lần chạy cũ.

## Brain Hub

Chạy bằng `npm start` để bật Model Hub local: đăng ký/đăng nhập, publish Brain, leaderboard,
trang model, lineage và **Fork & Evolve**. Điểm public không lấy từ client: server chạy lại
genome trên 7 hidden seeds và xếp hạng theo mean score. Dữ liệu dev nằm trong `.data/`
(đã gitignore). Khi deploy production, bắt buộc đặt biến `NEURO_HUB_SECRET` ổn định và dùng
volume/database bền vững thay cho file local nếu nền tảng không giữ filesystem.

## Neuroevolution hoạt động ra sao (tóm tắt)

```
1. Tạo N cá thể, mỗi con một mạng nơ-ron trọng số NGẪU NHIÊN
2. Cả N con cùng chơi một lượt (cùng seed → cùng map, so sánh công bằng):
      giác quan (getInputs) → mạng nơ-ron (forward) → hành động (step) → cộng reward
3. Tất cả chết → xếp hạng theo fitness (tổng reward cả đời)
4. Tiến hoá tạo thế hệ mới: ELITE + CHỌN LỌC (tournament) + LAI GHÉP + ĐỘT BIẾN
5. Quay lại bước 2 — đường fitness đi lên nghĩa là AI đang học
```

"Gen" của một cá thể = toàn bộ trọng số mạng nơ-ron trải phẳng thành một mảng số. Không ai
"dạy" AI — hành vi tốt sống sót và được nhân giống nhiều hơn qua các thế hệ.

Giải thích đầy đủ hơn cho từng game nằm trong `docs/`:
- **`docs/introduce/<game>.md`** — giải thích toàn bộ logic thuật toán hiện tại (giác quan,
  cách ra quyết định, thiết kế reward, điểm thú vị để quan sát). Xem
  [`docs/introduce/flappy-bird.md`](docs/introduce/flappy-bird.md) làm mẫu.
- **`docs/improve/<game>.md`** — đề xuất cải tiến chức năng/thuật toán, vd
  [`docs/improve/2048.md`](docs/improve/2048.md).

## Kiến trúc code

```
index.html / style.css      giao diện
js/
├── nn.js                   AGENT — mạng nơ-ron feedforward, gen = trọng số phẳng
├── ga.js                   TRAINER — thuật toán di truyền, KHÔNG biết gì về luật game
├── environments/*.js       LUẬT GAME — mỗi game 1 class, cùng implement 1 interface chung
├── main.js                 nối UI ↔ Trainer ↔ Environment, chạy vòng lặp chính
├── ui.js                   toàn bộ thao tác DOM (thống kê, biểu đồ, bảng xếp hạng, lịch sử...)
├── storage.js               lưu lịch sử các lần chạy tốt nhất (localStorage)
├── brain.js                 định dạng/validate/hash/export Brain JSON
├── random.js                RNG có seed để experiment tái lập được
├── analytics.js             funnel event local + endpoint tuỳ chọn
├── analysis.js              phân tích sau khi chạy + đề xuất chỉnh thông số
├── compare.js                so sánh "trước vs sau" cùng 1 dàn map
└── heatmap.js                tính lưới policy heatmap
```

Chi tiết interface mà mỗi environment phải implement, xem comment đầu file
[`js/environments/flappy.js`](js/environments/flappy.js).

## Kiểm thử

Production vẫn không có build step hay bundler. Test dùng Node thuần, không có dependency:

```bash
npm test
```
