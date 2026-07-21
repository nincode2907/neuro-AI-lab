# Đề xuất cải thiện AI <Tên game>

<!--
KHUÔN cho docs/improve/<key>.md. Mẫu chuẩn: docs/improve/flappy-bird.md và docs/improve/2048.md.
Mỗi đề xuất phải bám CODE THẬT của game (dựa trên hành vi quan sát được lúc verify), không
nói chung chung. Đánh số tăng dần. Mục đã làm rồi thì tiêu đề ghi "✅ ĐÃ LÀM". Xoá comment này.

Nguồn ý tưởng có tiền lệ trong repo (diễn giải RIÊNG cho game này, đừng chép):
  - Thêm input / feature engineering  (giác quan quan hệ, hệ quy chiếu tương đối)
  - Reward shaping cẩn thận            (cảnh báo reward-hacking)
  - Annealing biên độ đột biến         (đã có _currentMutationStd trong ga.js)
  - Crossover theo "khối neuron"       (giữ building block)
  - Bộ nhớ recurrent                   (nâng trần năng lực, đắt)
  - Curriculum khó dần                 (truyền tham số động qua envOptions/configFor)
  - Tìm kiếm sâu hơn                   (mạng làm hàm lượng giá + minimax/expectimax)
  - Nhiều seed / thế hệ                (seedsPerGen — giảm "ăn may" map dễ)
-->

## 1. <Tên đề xuất>

**Hiện tại**: <giới hạn/điểm yếu hiện thời, trỏ tới code cụ thể trong <key>.js>

**Cải thiện**: <đề xuất cụ thể; chèn đoạn code ngắn nếu giúp rõ ý>

**Giá**: <nhỏ / trung bình / lớn — cả công sức lẫn rủi ro>

## 2. <Tên đề xuất>

**Hiện tại**: …

**Cải thiện**: …

**Giá**: …
