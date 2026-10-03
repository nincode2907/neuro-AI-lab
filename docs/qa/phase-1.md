# Phase 1 — Dữ liệu và vòng đời chạy

Ngày kiểm tra: **03/10/2026**. Kết quả: **P1-01 → P1-08 đã triển khai và qua kiểm tra**.
Đây là nghiệm thu phase 1, chưa phải nghiệm thu toàn bộ v0 hoặc chất lượng học của AI.

## Thay đổi đã thực hiện

| Task | Kết quả |
|---|---|
| P1-01 | `settings.js` normalize/validate dùng chung cho UI, storage và tạo phiên; identity bỏ option của game đang ẩn; giới hạn population/node/mutation/seed/depth và ngân sách |
| P1-02 | Schema 2, environment 2, algorithm 1; key v2 riêng, giữ nguyên key cũ và backup đầy đủ; hợp nhất ID trùng theo timestamp, migration idempotent; UI xuất/phục hồi từng nguồn |
| P1-03 | Champion riêng gồm genome + score/fitness episode + seed + generation; latest lưu top tối đa 30 genome đã đánh giá, cập nhật cả khi kém record; chọn nguồn học tiếp tường minh |
| P1-04 | Metric từng cá thể/từng seed; selection dùng mean fitness, chart score dùng mean score tốt nhất, record dùng episode thực; snapshot chốt ở gen N trước gây giống N+1 |
| P1-05 | Validate kiến trúc/genome/số hữu hạn/metric/version trước lưu và resume; lỗi resume hiển thị, không tự tạo population random thay thế |
| P1-06 | API lưu/xóa trả `{ok,error}`; UI báo lỗi quota/quyền/JSON; training mới chạy trong bộ nhớ dù storage hỏng/bị chặn |
| P1-07 | `RunSession` quản lý idle/running/paused/finished, mode comparing khi so sánh đang hoạt động; Pause/Resume giữ đúng Trainer; Stop riêng; run ID và compare ID loại callback cũ |
| P1-08 | Trần episode theo game, tùy chỉnh 1–200.000 tick; giới hạn generation/phút phiên; đồng hồ active bỏ thời gian Pause; compare dùng cùng trần, phân biệt done/truncated |

`state` giữ trạng thái training, `mode` biểu diễn comparing và vẫn nhớ training đang chạy,
pause hay đã kết thúc. Cách này cho phép compare độc lập mà không mất trạng thái phiên chính.
Pause hủy compare đang chạy; Stop/Reset/Start mới cũng vô hiệu callback compare cũ.

## Kiểm tra tự động

Chạy bằng Python 3 và Node **v16.20.2**:

```bash
python3 tests/run.py
```

Kết quả: **27 nhóm kiểm tra đạt**, cộng kiểm tra ID DOM và relative import.

- `tests/phase1.mjs`: 21 nhóm về settings/genome/Trainer, multi-seed, champion/latest,
  migration/backup/quota/JSON/version và session/compare.
- `tests/lifecycle.mjs`: 6 nhóm chạy handler và rAF thật trong `main.js`, thay UI/render/game
  bằng fixture để kiểm tra state, thời gian và callback. Bao gồm callback compare cũ sau
  Reset rồi bắt đầu compare mới; Stop; Pause không tăng tick; Resume giữ Trainer;
  x50 không vượt giới hạn generation; time/target stop; storage fail và resume không fallback.
- Smoke 4 game/8 cấu hình, mỗi cấu hình chạy 3 generation với 2 seed và trần 4 tick:
  Flappy lookahead 1/2/3; 2048 depth 1/2/3 (depth 3 đủ 4 feature); Snake; Hill Climb.
  Save/resume/compare dùng module thật. Trần nhỏ nhằm kiểm tra wiring, không đánh giá khả năng chơi.
- Case quyết định: cá thể đứng thứ hai về fitness lập score 50 ở seed đầu và chỉ score 2
  ở seed cuối; champion giữ đúng genome/seed của nó, mean score là 26, top fitness giữ genome khác.
- Collision migration giữ cả hai nguồn và record legacy; chọn latest theo timestamp dù score
  kém hơn; giữ 15 nguồn dù active history chỉ 10 mục; ghi backup/v2 thất bại không xóa key cũ.
- `git diff --check`: đạt.

Runner chỉ tạo package ES modules trong thư mục tạm; không thêm build step/dependency cho app.

## Kiểm tra trên Chrome

Kiểm tra trực tiếp trên app được phục vụ bởi static HTTP server:

1. Controls mới, trạng thái phiên và 4 game xuất hiện.
2. 2048: N=10, hidden=4, trần 4 tick, giới hạn 3 generation → tự dừng, hiện tổng kết
   đúng lý do và thông báo đã lưu **snapshot gen 3**; champion ghi riêng.
3. Chọn “Tiếp tục từ lịch sử” → hiện snapshot/champion/seed, khóa kiến trúc và trần tick.
4. Học tiếp snapshot gen 3, giới hạn 1 generation → lưu **snapshot gen 4** và giữ champion cũ.

Lần mở đầu dùng một số module trong cache từ phiên cũ, dẫn tới lỗi method mới chưa có;
sau hard reload toàn bộ module, luồng lưu/resume hoạt động. README đã ghi cách hard reload.
Không có kết quả console/browser automation để kết luận mọi lỗi runtime đều vắng mặt;
bằng chứng Chrome giới hạn ở các luồng nhìn thấy trên UI ở trên.

## Quy tắc dữ liệu và hạn chế

- Key mới: `neuroai:history:v2:<game>`; backup: `neuroai:migration:v2:<game>`.
  `neuroai:history:<game>` và `neuroai:lastRun:<game>` được giữ nguyên.
- Bản cũ lưu sau evolve nên nhãn generation là N+1 còn genome thuộc N; migration điều chỉnh
  snapshot về N, giữ nhãn/record gốc trong `legacyRecords` và raw backup.
- Không dựng champion từ record cũ vì không đủ bằng chứng liên kết. Legacy snapshot chỉ dùng
  làm nguồn gây giống và được đánh giá lại với giới hạn hiện tại.
- Latest là top genome của thế hệ đã đánh giá, không phải toàn bộ quần thể hay checkpoint
  giữa episode. Resume sinh quần thể mới; chưa tái lập đầy đủ RNG/state cũ.
- Snapshot chỉ chốt khi hoàn tất mọi seed của generation. Stop giữa episode không lưu ván
  dở; snapshot hoàn chỉnh gần nhất vẫn còn. Trần thời gian làm dừng sau khi tick hiện tại trả về.
- `envVersion=2` phân biệt bộ metric/trần episode mới; phiên bản thuật toán vẫn là 1 vì
  selection/crossover/mutation chưa đổi. RNG master seed/replay tái lập thuộc phase 3.
- Export ở đây là backup dữ liệu gốc để phục hồi migration; chưa phải chức năng import/export
  snapshot dùng trên thiết bị khác trong backlog P1 sau v0.
- Responsive, preset, kiểm chứng trên nhiều map độc lập, Worker, tối ưu chart, QA nhiều browser
  và số đo hiệu năng 30 phút vẫn thuộc phase 2–5. Chưa có cam kết AI đạt score cụ thể.
