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
| 🏔️ Hill Climb Racing | điều khiển ga/phanh trên địa hình gồ ghề |

Thêm game mới **không cần sửa** `ga.js`/`main.js`/`ui.js` — xem hướng dẫn ở đầu
[`js/environments/registry.js`](js/environments/registry.js).

## Chạy như thế nào

Kế hoạch v0, các việc cần làm và thứ tự thực hiện nằm trong [PLAN.md](PLAN.md).

Không có bước cài đặt hay build. Cần chạy qua HTTP (không mở trực tiếp bằng `file://`) vì
dùng ES module:

```bash
# một trong các cách sau
npx serve .
python3 -m http.server 8000
# hoặc: chuột phải index.html trong VS Code → "Open with Live Server"
```

Mở trình duyệt, chọn game, chỉnh thông số, bấm **▶ Start**. Kéo tốc độ lên x50 để tua nhanh
việc học.

**Pause → Resume** tiếp tục đúng phiên hiện tại. **Stop** kết thúc và hiện tổng kết;
Start sau Stop tạo một phiên mới theo lựa chọn khởi tạo. Để học tiếp, chọn **Tiếp tục từ lịch sử**
và nguồn **snapshot mới nhất** hoặc **champion**. Snapshot gen N gây giống gen N+1,
không khôi phục quần thể đang chơi giữa ván.

Có thể chạy 1–3 map mỗi thế hệ trên cả bốn game. Fitness và score trung bình được tính
qua các map; kỷ lục là score cao nhất của một episode, có genome và seed riêng.
Chart score hiển thị score trung bình tốt nhất trong quần thể, không phải record một map.

Trần tick mặc định: Flappy 20.000, Snake 8.000, 2048 4.000, Hill Climb 20.000.
Chạm trần được ghi riêng với kết thúc theo luật. Có thể đặt giới hạn số thế hệ/phút của phiên;
đồng hồ phút không tính thời gian Pause. So sánh trước/sau dùng cùng trần tick với training.

Lịch sử v2 lưu riêng champion và top gen thế hệ mới nhất, tối đa 10 cấu hình/game theo
thời gian cập nhật. Dữ liệu cũ và bản backup migration được giữ nguyên, kể cả cấu hình trùng;
record cũ có nhãn **chưa kiểm chứng** vì không biết chắc genome nào lập thành tích đó.
Nút tải backup xuất dữ liệu gốc; mục nguồn cũ cho phục hồi snapshot khác đã được hợp nhất.
Nếu lưu bị chặn/đầy, app thông báo lỗi và tiếp tục training trong bộ nhớ.

Sau khi cập nhật source, tải lại toàn bộ trang (Cmd/Ctrl+Shift+R) để tránh trộn module cũ trong cache.

## Neuroevolution hoạt động ra sao (tóm tắt)

```
1. Tạo N cá thể, mỗi con một mạng nơ-ron trọng số NGẪU NHIÊN
2. Cả N con cùng chơi một lượt (cùng seed → cùng map, so sánh công bằng):
      giác quan (getInputs) → mạng nơ-ron (forward) → hành động (step) → cộng reward
3. Hết episode → lặp đủ số map → xếp hạng theo fitness trung bình
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
├── settings.js             chuẩn hóa/validate settings và identity theo game
├── session.js              state phiên, đồng hồ active và ngân sách chạy
├── versions.js             schema/environment/algorithm version
├── storage.js              champion, snapshot mới nhất và migration (localStorage)
├── analysis.js              phân tích sau khi chạy + đề xuất chỉnh thông số
├── compare.js                so sánh "trước vs sau" cùng 1 dàn map
└── heatmap.js                tính lưới policy heatmap
```

Chi tiết interface mà mỗi environment phải implement, xem comment đầu file
[`js/environments/flappy.js`](js/environments/flappy.js).

## Kiểm tra

Cần Python 3 và Node >=16 cho bộ kiểm tra, không cần cài dependency:

```bash
python3 tests/run.py
```

Runner tạo thư mục tạm để chạy ES modules. Kiểm tra settings, genome, metric nhiều seed,
migration/backup, lỗi storage và lifecycle/callback thật của `main.js`; có smoke 4 game/8 cấu hình.
Kết quả phase 1 nằm trong [docs/qa/phase-1.md](docs/qa/phase-1.md).

## Không có

Build tool, bundler, package manager hay linter — dự án giữ tối giản để
mọi logic đều đọc được trực tiếp từ source, không qua lớp trừu tượng nào.
