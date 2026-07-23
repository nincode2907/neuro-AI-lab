# Cờ Tướng (NN eval) — ghi chú kiến trúc & đề xuất cải tiến

Tài liệu này giải thích **vì sao Cờ Tướng từng lag và không xem được ván**, thay
đổi vừa làm để sửa, và một danh sách **đề xuất cải tiến** xếp theo mức đáng làm.

---

## 1. Kiến trúc hiện tại (tóm tắt)

Khác Flappy/Snake/2048 (mạng trực tiếp CHỌN hành động), ở Cờ Tướng mạng nơ-ron
của cá thể chỉ đóng vai **hàm đánh giá thế cờ** (`nnEvaluator.js`) cho một cây
tìm kiếm **minimax + alpha-beta** (`minimax.js`). Cá thể cầm **Đỏ**, đấu leo
thang với `bot.js` (Đen) từ cấp 1 tới 7; `getScore()` = cấp cao nhất đã hạ.

```
Trainer (ga.js)  →  XiangqiEnv.step()  →  searchBestMove(minimax, evaluate=NN)  →  1 nước
                                       →  bot.chooseMove(minimax, evaluate=heuristic) →  1 nước
```

- `heuristic.js` — hàm đánh giá CỐ ĐỊNH cho bot (giá trị quân + vị trí).
- `nnEvaluator.js` — biến 1 thế cờ thành `FEATURE_COUNT` (14) đặc trưng rồi cho
  mạng chấm điểm. Đây là thứ GA thực sự tiến hoá.
- `lib/xiangqi.js` — luật cờ đầy đủ (sinh nước, chiếu, chiếu bí, hoà).

---

## 2. Vấn đề: lag + không xem được ván (đã sửa)

**Nguyên nhân gốc:** bản cũ, MỖI `step()` chơi **TRỌN một ván** trong đúng một
tick (vòng `while` tới khi hết cờ hoặc chạm `moveLimit`). Hệ quả:

- **Nặng/giật:** một tick `stepAll()` = N cá thể × ~vài chục nước/ván × một lần
  minimax mỗi nước. Cả khối đó chạy ĐỒNG BỘ trên main thread trong 1 frame →
  đơ hình. Ở tốc độ cao hoặc quần thể lớn, mỗi frame treo hàng trăm ms.
- **Không xem được:** cả ván diễn ra trong 1 frame rồi `viewGame` nhảy thẳng
  tới thế cờ CUỐI — mắt chỉ thấy kết quả, không thấy diễn biến từng nước.

**Cách sửa (đã làm trong `environment.js`):** chơi **một nửa nước (1 ply) mỗi
tick**, có nhịp chờ `TICKS_PER_MOVE` giữa 2 nước — đúng cơ chế `TICKS_PER_MOVE`
của 2048. Cụ thể:

- `step()` giờ đi đúng 1 ply rồi trả về; các tick "chờ" ở giữa không chạy minimax
  nên rất nhẹ. Kéo **slider Tốc độ (x1–x50)** để tua nhanh — giờ nó có tác dụng
  thật với Cờ Tướng.
- Trạng thái ván (`this.game`, `this.bot`, `this.moves`) được GIỮ qua các tick,
  không dựng lại mỗi lần.
- Reward = 0 ở các tick giữa ván, chỉ dồn vào tick **kết thúc ván** (`_finishGame`);
  công thức fitness giữ nguyên. Thắng thì tự mở ván mới với bot cấp cao hơn
  (`done=false`, leo thang tiếp qua các tick sau); thua/hoà thì `done=true`.
- Cooldown khởi điểm mỗi ván được **làm lệch ngẫu nhiên** giữa các cá thể, để
  tick "đi nước" (lúc chạy minimax) của cả quần thể không dồn hết vào cùng một
  frame → giãn tải, đỡ giật hơn nữa.

**Đánh đổi:** một thế hệ giờ trải qua NHIỀU tick hơn hẳn (mỗi ván ~số_nước ×
`TICKS_PER_MOVE` tick thay vì 1 tick). Đây là bản chất của việc "xem từng nước";
dùng slider tốc độ khi muốn train nhanh, để x1 khi muốn ngồi xem.

> Chỉnh nhịp: `TICKS_PER_MOVE` trong `environment.js`. Lớn hơn = xem chậm/rõ hơn
> và các frame nặng giãn ra (đỡ giật); nhỏ hơn = xem nhanh hơn.

---

## 3. Đề xuất cải tiến

Xếp theo **tỉ lệ lợi ích / công sức**. Nhóm A giảm lag/tăng tốc; nhóm B giúp AI
mạnh hơn (leo cao hơn); nhóm C cải thiện trải nghiệm xem.

### A. Hiệu năng (giảm lag sâu hơn)

1. **Bảng chuyển vị (transposition table) + Zobrist hashing.** Minimax hiện
   duyệt lại rất nhiều thế cờ trùng (chuyển vị). Một `Map` từ hash thế cờ →
   {độ sâu, điểm, cận} cắt bỏ phần lớn nút lặp — thường nhanh **2–5×** ở cùng độ
   sâu, mở đường tăng `evalDepth` mà không lag thêm. Đây là món **đáng làm nhất**.

2. **Đưa minimax sang Web Worker.** Hiện toàn bộ tìm kiếm chạy trên main thread
   nên frame vẫn có thể khựng ở tick đi nước. Chạy minimax trong 1–vài Worker
   (mỗi worker lo một phần quần thể) để **UI không bao giờ đơ**, main thread chỉ
   lo vẽ. Công lớn hơn (phải serialize thế cờ/genome), nhưng xoá hẳn hiện tượng
   treo hình.

3. **Ngân sách tính toán mỗi frame (round-robin).** Thay vì mọi cá thể tới lượt
   đi nước cùng lúc, cho `stepAll` chỉ xử lý một NHÓM cá thể mỗi frame theo hạn
   mức thời gian (vd ≤ 8 ms/frame), phần còn lại để frame sau. Giữ 60 fps ổn định
   kể cả quần thể lớn. (Việc làm lệch cooldown hiện tại là một xấp xỉ thô của ý
   này.)

4. **Killer moves + history heuristic trong sắp xếp nước.** `orderMoves` mới ưu
   tiên nước ĂN QUÂN (MVV). Thêm "nước gây cắt tỉa tốt ở nhánh anh em" (killer)
   và thống kê history giúp alpha-beta cắt sớm hơn nữa — nhanh thêm ~1.5–2× ở
   độ sâu ≥ 3, gần như miễn phí.

5. **Giảm gọi `moves()` của thư viện.** Sinh nước hợp lệ là chỗ ĐẮT nhất (đã ghi
   chú trong `minimax.js`). Cân nhắc: cache danh sách nước ở nút gốc, hoặc dùng
   lớp sinh nước nhẹ hơn cho nội bộ tìm kiếm.

### B. Chất lượng (giúp AI leo cấp cao hơn)

6. **Tăng `evalDepth` cho AI.** Đang 1–2 tầng — rất nông, AI gần như "phản xạ".
   Sau khi có (1) transposition table, nâng lên 3–4 tầng để nhìn xa hơn; đây
   thường là yếu tố quyết định việc thắng được bot cấp 5–7.

7. **Đánh giá trên NHIỀU ván mỗi cấp.** Thang cấp hiện quyết định thắng/thua
   bằng ĐÚNG MỘT ván/cấp — một ván xui (bot bốc trúng nước hay, hoặc chuỗi ngẫu
   nhiên của cấp yếu) làm sai lệch fitness. Cho mỗi cấp đấu 2–3 ván lấy đa số/
   trung bình → chọn được cá thể tổng quát, giống ý tưởng "nhiều seed/thế hệ" đã
   làm cho Flappy (xem `seedsPerGen`).

8. ✅ **Thêm/tinh chỉnh đặc trưng cho `nnEvaluator`** (ĐÃ LÀM — `nnEvaluator.js`,
   `FEATURE_COUNT` 14 → 19). 5 đặc trưng mới, tất cả CỐ Ý tránh gọi `game.moves()`
   (phép tính đắt nhất của engine — xem đầu file) để không làm chậm minimax dù
   chạy ở độ sâu cao:
   - **Tướng lộ diện** (2 đặc trưng, mỗi bên) — mất hết CẢ Sĩ lẫn Tượng, suy trực
     tiếp từ số đếm đã có sẵn, không tốn thêm phép quét nào.
   - **Δ Tốt qua sông ở cột giữa** — Tốt qua sông ở cột 3-5 uy hiếp hơn hẳn Tốt
     qua sông ở biên (chỉ còn đi thẳng được).
   - **Δ cột Xe/Pháo kiểm soát** — xấp xỉ "cột thoáng" bằng cách chỉ xét Tốt có
     chặn cột hay không (bỏ qua các loại quân khác để giữ rẻ).
   - **Δ Pháo sẵn ngòi** — quét CỤC BỘ quanh từng Pháo (tối đa 4 con/bàn) theo 4
     hướng thẳng, phát hiện "có ngòi + có mục tiêu địch xa hơn ngòi", rẻ hơn
     nhiều so với sinh nước hợp lệ đầy đủ.
   Đã CÂN NHẮC nhưng KHÔNG thêm "tính cơ động" (số nước hợp lệ) — tính đúng đòi
   hỏi gọi `game.moves()` ở MỌI lá minimax, quá đắt nhất là khi `evalDepth` lên
   tới 7 tầng (xem mục 6 "Đề xuất cải tiến" ở UI).
   ⚠️ Đổi số đặc trưng = đổi độ dài gen → model/lịch sử Xiangqi cũ (14 input)
   KHÔNG resume được nữa. `main.js` (`expectedGeneLength`) đã có lưới an toàn tự
   phát hiện & rơi về quần thể ngẫu nhiên nếu gen cũ lỡ không khớp, thay vì nạp
   nhầm gây lệch trọng số âm thầm.

9. **Reward shaping theo từng nước (thưa → dày).** Reward hiện chỉ ở cuối ván.
   Thêm tín hiệu nhẹ theo chênh lệch vật chất/thế trận mỗi nước cho gradient dày
   hơn ở thế hệ đầu — CẨN THẬN reward hacking (thưởng ăn quân có thể khiến AI đổi
   quân bừa); giữ trọng số nhỏ so với phần thưởng thắng/leo cấp, giống cách 2048
   để mẹo chiến thuật làm INPUT thay vì cộng thẳng vào reward.

10. **Đồng tiến hoá / self-play.** Thay bot heuristic cố định bằng cho các cá thể
    đấu lẫn nhau (hoặc đấu bản sao đời trước). Đối thủ mạnh dần theo chính quần
    thể — tránh trần "chỉ giỏi tới mức thắng được bot cấp 7".

11. **Sổ khai cuộc (opening book).** Vài nước đầu gần như cố định; tra sổ thay vì
    minimax vừa nhanh vừa tránh sai lầm khai cuộc, dành sức tính cho trung/tàn cuộc.

### C. Trải nghiệm xem

12. **Tô sáng nước vừa đi.** Lưu nước cuối (`from`/`to`) và vẽ khung/đường mờ để
    mắt bắt được quân nào vừa di chuyển — rất hữu ích khi xem ở tốc độ cao.

13. **Chơi thử Cờ Tướng ở tab 🎮.** Hiện màn "Chơi thử" chỉ hỗ trợ 2048. Có thể
    mở rộng cho Cờ Tướng: người chơi cầm Đỏ, "AI gợi ý" chạy `searchBestMove`
    hiện nước khuyên, "AI chơi hộ" để model tự đánh — dùng lại đúng hạ tầng
    `PlaySession`/`play.js`, chỉ cần một bộ điều khiển nhập nước cho cờ.

14. **Hoà do lặp thế.** Kiểm tra lặp thế 3 lần để kết ván sớm thay vì lê tới
    `moveLimit` — ván ngắn hơn, xem đỡ chán, và fitness bớt nhiễu bởi các ván
    hoà kéo dài vô nghĩa.

---

## 4. Lộ trình gợi ý

1. **(A1) Transposition table** — mở khoá mọi thứ khác (cho phép tăng độ sâu).
2. **(B6) Tăng `evalDepth` lên 3** — hưởng lợi ngay từ (A1).
3. **(B7) Nhiều ván/cấp** — ổn định fitness, chọn đúng cá thể giỏi.
4. **(A2) Web Worker** — nếu vẫn muốn quần thể lớn mà UI tuyệt đối mượt.
5. Còn lại tuỳ nhu cầu (đặc trưng, self-play, chơi thử cờ…).
