# <Tên game> — Full logic của thuật toán học (Neuroevolution + GA)

<!--
KHUÔN cho docs/introduce/<key>.md. Mẫu chuẩn để bám theo: docs/introduce/flappy-bird.md
(đọc trọn trước khi viết). Văn phong tiếng Việt, giải thích CẶN KẼ *why*, không liệt kê suông.
Link tương đối tới code: ../../js/environments/<key>.js, ../../js/nn.js, ../../js/ga.js —
chèn số dòng khi trỏ tới đoạn cụ thể. Xoá mọi comment <!-- --> trước khi hoàn tất.
-->

> Tài liệu này giải thích **toàn bộ logic** đằng sau AI trong
> [<key>.js](../../js/environments/<key>.js), kết hợp bộ não [nn.js](../../js/nn.js)
> và thuật toán tiến hoá [ga.js](../../js/ga.js). Đây là **neuroevolution** — quần thể mạng
> nơ-ron ngẫu nhiên tiến hoá qua chọn lọc tự nhiên, không gradient, không "đúng/sai" cho từng
> hành động, chỉ có **fitness cao hơn = gen tốt hơn**.

---

## 1. Một cá thể (individual) gồm những gì?
<!-- { net, env, fitness, alive }; gen = toàn bộ trọng số+bias trải phẳng; luật chơi nằm
     cứng trong <key>.js, cái GA tiến hoá là CÁCH phản ứng với giác quan. Kiến trúc mạng
     [inputs, hiddenNodes, outputs] cố định trong 1 lần chạy. -->

## 2. Giác quan — các input AI "nhìn thấy"
<!-- Giải thích TỪNG input: ý nghĩa, công thức chuẩn hoá, dải giá trị. Chỉ rõ chỗ nào là
     FEATURE ENGINEERING (đưa sẵn hiệu số/quan hệ) và vì sao. Giải thích vì sao chuẩn hoá
     0..1 quan trọng (tanh bão hoà). Nêu cái AI KHÔNG biết (không có input nào cho nó). -->

## 3. Từ output tới hành động — cái gì chi phối quyết định
<!-- Khuôn diễn giải output (ngưỡng/argmax/lượng giá). Xếp các yếu tố theo mức chi phối
     quyết định, từ "quyết định nhiều nhất" tới "tinh chỉnh". Nhấn mạnh: mạng feedforward
     không có trí nhớ giữa các tick (trừ khi có recurrent). -->

## 4. Phần thưởng (reward) — định hình "gen tốt" nghĩa là gì
<!-- Liệt kê thành phần reward + điều kiện done. fitness = tổng reward cả đời (ga.js), không
     discount. GIẢI THÍCH tương quan độ lớn giữa "sống sót" và "mục tiêu chính" — vì sao chọn
     các con số đó. ⚠️ Cảnh báo reward-hacking nếu game dễ dính. -->

## 5. Vòng lặp một thế hệ (nhắc lại từ ga.js)
<!-- Ngắn gọn: N cá thể cùng seed cùng chơi → xếp hạng fitness → elite + tournament +
     crossover + mutation → thế hệ mới. Trỏ về ga.js cho chi tiết, không chép lại. -->

## 6. Điểm thú vị để quan sát
<!-- Đặc trưng RIÊNG game này khi xem realtime: nấc/giai đoạn học, hành vi nổi lên bất ngờ,
     chỗ nào trên biểu đồ lộ ra điều gì. Bỏ mục này nếu game không có gì đặc biệt. -->
