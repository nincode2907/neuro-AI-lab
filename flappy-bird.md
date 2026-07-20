# Đề xuất cải thiện AI Flappy Bird

## 3. ✅ ĐÃ LÀM — Mutation std tự co lại theo thời gian (annealing)

**Hiện tại**: `_mutate()` luôn cộng nhiễu `randGaussian(0, 0.5)` — biên độ
cố định. Đầu cần khám phá mạnh, cuối cần tinh chỉnh nhẹ, nhưng 0.5 không
đổi nên về cuối cứ "phá" gen tốt.

**Cải thiện**: cho `mutationStd` giảm dần (theo thế hệ, hoặc giảm khi
đường học chững lại — đã có sẵn phát hiện "plateau" trong `analysis.js`).
Khám phá rộng lúc đầu → hội tụ mượt lúc sau.

**Giá**: rất nhỏ, thêm 1 biến + 1 dòng decay.

**Kết quả**: đã implement trong [`js/ga.js`](js/ga.js) —
`_currentMutationStd()` co từ 0.5 (gen 1) về sàn 0.08 theo phân rã nửa chu
kỳ mỗi 40 thế hệ (`MUTATION_STD_START`/`END`/`HALFLIFE`), dùng
`this.generation` nên resume từ lần chạy trước không bị "giật" về mức khám
phá gen 1.

Verify: gen1=0.500, gen40=0.294, gen200=0.093; resume ở gen150 cho
std=0.112 ngay lúc khởi tạo; training thật (Snake 30 gen) vẫn học tốt
(avg 91→451, score 1→30).

## 4. Lai ghép theo "khối neuron" thay vì từng gen rời

**Hiện tại**: `_crossover()` uniform 50/50 từng gen → dễ xé lẻ các trọng số
của cùng một neuron vốn phối hợp ăn ý (phá "building block" — đã ghi trong
[`docs/flappy.md`](docs/flappy.md) mục 6.3).

**Cải thiện**: lai ghép theo neuron — lấy trọn bộ trọng số vào/ra của một
node ẩn từ cùng một cha mẹ. Giữ nguyên "mạch con" đã học được.

**Giá**: trung bình (cần biết cấu trúc lớp trong crossover).

## 5. Reward shaping: thưởng canh giữa khe (cẩn thận reward hacking)

**Hiện tại**: `+1`/tick, `+100`/ống. Tín hiệu "vượt ống" thưa — nhiều thế
hệ đầu chưa ai vượt nổi ống nào nên GA gần như mù.

**Cải thiện**: thưởng theo mức canh giữa khi vượt ống:

```js
reward += 100 * (1 - |birdY - gapY| / (PIPE_GAP / 2));
```

Con vượt sát mép được ít hơn con vượt chính giữa → tạo gradient mượt hướng
tới bay đẹp.

**Giá**: nhỏ, nhưng rủi ro: shaping sai dạy AI hành vi phụ (đã cảnh báo ở
`docs/flappy.md` mục 4). Phải thử và quan sát.

## 6. Bộ nhớ (recurrent) — nâng trần năng lực

**Hiện tại**: `nn.js` là feedforward thuần, không nhớ gì giữa các tick. Mọi
quyết định chỉ từ ảnh chụp hiện tại.

**Cải thiện**: cho 1 giá trị hidden/output vòng lại làm input tick sau →
học được nhịp điệu ("vừa vỗ 2 lần thì thôi"). Nâng trần năng lực rõ nhất,
nhưng cũng khó tiến hoá nhất.

**Giá**: lớn (sửa kiến trúc mạng + gen). Để dành khi các cách trên đã cạn.

## 7. Curriculum — khó dần theo trình độ

Bắt đầu khe rộng/ống thưa, hẹp/sát dần khi quần thể giỏi lên (truyền
`PIPE_GAP`/`PIPE_SPACING` động qua `envOptions` như đã làm với `lookahead`).
Giúp giai đoạn đầu "bò" dễ hơn rồi mới "chạy".

**Ý tưởng phụ — vệt bay mờ dần (ghost trail)**: vẽ đường đi của con giỏi
nhất dạng vệt mờ dần phía sau, so vệt gen 1 (giật cục, đâm sớm) với vệt
gen 50 (lượn sóng mượt qua đúng tâm khe). Chỉ cần lưu N điểm y gần nhất,
code rất nhẹ.
