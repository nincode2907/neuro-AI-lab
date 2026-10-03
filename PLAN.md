# Neuroevolution Lab — Kế hoạch v0 và các phase thực hiện

Ngày cập nhật: **03/10/2026**. Căn cứ: source hiện tại và các ghi chú trong `docs/`.

Đây là kế hoạch hoàn thiện app đã có. Phase 0 và phase 1 đã được triển khai;
các checkbox còn trống là công việc tiếp theo, không phải tính năng đã hoàn thành.

## 1. Mục tiêu v0

Người mới có thể chọn game, chạy một thí nghiệm bằng cấu hình có sẵn, xem AI thay đổi hành vi,
hiểu fitness khác score thế nào và tiếp tục từ gen đã lưu. Người muốn tìm hiểu sâu có thể
đổi một tham số và kiểm chứng ảnh hưởng bằng phép so sánh công bằng.

V0 giữ HTML/CSS/JavaScript thuần, ES modules và chạy bằng static HTTP server. Chưa cần
backend, tài khoản, đồng bộ đám mây, LLM hay chuyển framework để đạt mục tiêu này.

**Game trong v0:**

| Game | Vai trò trong trải nghiệm | Phạm vi |
|---|---|---|
| Flappy Bird | Game mặc định, dễ quan sát quan hệ giác quan → hành động → sống/chết | Lookahead 1–3, heatmap, huấn luyện nhiều map |
| Snake | Quan sát học né chết rồi tìm mồi | Giữ luật và mạng hiện tại; kiểm tra reward và giới hạn episode |
| 2048 | So sánh policy trực tiếp với mạng lượng giá + expectimax | Policy là cấu hình khởi đầu; expectimax và feature engineering nằm trong phần nâng cao |
| Hill Climb Racing | Quan sát điều khiển liên tục trên địa hình | Giữ môi trường hiện tại; đo giới hạn thời gian và khả năng chạy trên máy phổ thông |

**Cờ tướng bị loại khỏi app và roadmap v0.** Không đầu tư tiếp engine, minimax, đấu bot,
UI hoặc tài liệu riêng cho game này. Bốn game hiện có đủ để minh họa các dạng hành động khác nhau;
chưa thêm game mới trước khi v0 đạt tiêu chí nghiệm thu.

## 2. Nền tảng đã có và khoảng trống thực tế

| Khu vực | Đã có trong source | Việc cần hoàn thiện |
|---|---|---|
| Huấn luyện | GA, elitism, tournament, crossover, Gaussian mutation có annealing; cùng seed trong một lượt | Kiểm chứng replay, tính nhất quán của score khi nhiều seed, giới hạn episode |
| Quan sát | Canvas quần thể, mạng nơ-ron, fitness/score chart, histogram, rank, milestones, heatmap Flappy | Bớt tải nhận thức; giải thích tín hiệu nào là tiến bộ và tín hiệu nào còn nhiễu |
| Lưu và học tiếp | Tối đa 10 mục/game theo cấu hình, localStorage, migrate định dạng cũ, resume từ top gen | Tách gen giữ kỷ lục khỏi snapshot mới nhất, validate dữ liệu, báo lỗi lưu, version hóa |
| So sánh | Hai genome chơi cùng một seed ngẫu nhiên, có trần 20.000 tick | Lưu seed; đánh giá nhiều seed độc lập; ghi rõ kết thúc tự nhiên hay chạm trần |
| Tổng kết | Heuristic phát hiện xu hướng/chững lại và gợi ý tham số | Gợi ý theo game; thao tác tiếp tục đúng nghĩa; không diễn giải dao động thành nguyên nhân chắc chắn |
| Giao diện | Nhiều control và card thông tin, khóa cấu hình khi chạy | Preset, phần nâng cao, Stop rõ ràng, responsive và bàn phím |
| Tài liệu | README, giới thiệu Flappy, cải tiến Flappy/2048 | Giới thiệu Snake/2048/Hill Climb; checklist QA và bằng chứng release |

### Những điểm cần xử lý trước khi thêm tính năng

Các điểm dưới đây là quan sát từ code, chưa phải kết luận sau một đợt QA đầy đủ:

1. `js/main.js` lưu `bestEver`/`bestEverScore` cùng `lastRanked`, trong khi `lastRanked`
   là top của **thế hệ vừa xong**. Thế hệ mới có thể kém hơn kỷ lục cũ, nên gen được lưu
   không nhất thiết là gen đã lập thành tích ghi trên mục lịch sử.
2. `js/ga.js` lấy trung bình fitness qua nhiều seed nhưng `evolve()` đọc score từ trạng thái
   environment của seed cuối. Cần tách score từng episode, score trung bình và record;
   không gắn record của cá thể A với genome của cá thể B được chọn theo fitness.
3. `js/ui.js` vẫn đọc option của game đang ẩn; `js/storage.js` đưa tất cả option vào `archId`.
   Ví dụ đổi lookahead Flappy có thể làm cấu hình lịch sử Snake đổi theo dù Snake không dùng nó.
4. `saveRun()` có thể trả thành công dù `_write()` đã catch lỗi quota/quyền lưu.
   `loadHistory()` mới kiểm tra array, chưa kiểm tra độ dài genome và số hữu hạn trước resume.
5. `analysis.js` gợi ý nhấn Start để chạy tiếp, nhưng `main.js` tạo Trainer mới sau Stop
   nếu chưa chọn resume. Ngưỡng score `>= 3` cũng không mang cùng ý nghĩa giữa 2048, Snake và Flappy.
6. `ComparisonRun` dùng một seed mới mỗi lần; cùng map giúp xem hành vi công bằng trong lượt đó,
   chưa đủ để kết luận mô hình tổng quát tốt hơn. RNG của GA/NN vẫn dùng `Math.random()`.
7. Vòng `speed` tick nằm trên main thread, `maxStepsPerGen` được đặt 999.999; cấu hình nặng
   có nguy cơ làm thao tác chậm. Chưa có số đo để quyết định có cần Worker trong v0 không.
8. `.side-panel` cố định 800px và chưa có media query. Registry có key số `'2048'`, nên
   vòng lặp object đưa 2048 lên đầu dropdown; cần chọn Flappy mặc định một cách tường minh.

## 3. Ưu tiên: cần cho v0, nên có, để sau

| Mức | Công việc | Lý do |
|---|---|---|
| P0 — bắt buộc | Gỡ cờ tướng; chuẩn hóa cấu hình theo game và migrate lịch sử | Thu gọn phạm vi, giữ được tiến độ của bốn game |
| P0 — bắt buộc | Snapshot có thành tích khớp genome; validate lưu/resume; báo lỗi lưu | Người dùng phải biết chính xác mình đã lưu và học tiếp từ đâu |
| P0 — bắt buộc | Start/Pause/Resume/Stop/Reset rõ ràng; giới hạn input và episode | Điều khiển ổn định, không có lượt chạy vô hạn ngoài ý muốn |
| P0 — bắt buộc | Flappy mặc định, preset theo game, phần nâng cao, giải thích score/fitness | Có đường bắt đầu đơn giản cho người mới |
| P0 — bắt buộc | Đánh giá hai genome trên cùng bộ seed độc lập, có giới hạn và kết quả tổng hợp | Phân biệt cải thiện thực với một map thuận lợi |
| P0 — bắt buộc | Responsive, thao tác bàn phím, giới hạn tải, smoke/regression và tài liệu 4 game | Hoàn thiện một bản có thể sử dụng và chia sẻ |
| P1 — nên có | Xuất/nhập snapshot JSON đã validate và có version | Sao lưu gen, chuyển thiết bị mà chưa cần tài khoản |
| P1 — nên có | Replay riêng champion; tải CSV kết quả benchmark | Dễ quan sát và kiểm tra lại kết quả |
| P1 — có điều kiện | Worker cho huấn luyện/benchmark | Làm trước release nếu cấu hình được hỗ trợ vẫn không đạt ngân sách phản hồi |
| P2 — sau v0 | Batch experiment, A/B tham số, nhiều training seed độc lập | Mở rộng từ demo sang công cụ thí nghiệm |
| P2 — sau v0 | Neuron crossover, curriculum, đối xứng 2048, reward shaping | Chỉ nhận khi benchmark cho thấy lợi ích; không mặc định coi thêm thuật toán là tốt hơn |
| P2 — sau v0 | Recurrent/NEAT, RL khác, PWA/offline, thêm game, cloud | Thay đổi kiến trúc hoặc phạm vi; lập kế hoạch riêng sau phản hồi thực tế |

P0 quyết định hoàn thành v0. P1 không chặn release, trừ Worker khi kết quả đo hiệu năng buộc phải dùng.
Các preset là điểm bắt đầu cần đo thử, không cam kết AI đạt một score cụ thể sau số thế hệ cố định.

## 4. Phase thực hiện

Thứ tự: **0 → 1 → 2 → 3 → 4 → 5**. Có thể đo hiệu năng từ phase 1 để phát hiện sớm.
Ước lượng dưới đây là công sức tương đối: S = thay đổi cục bộ, M = liên quan vài module,
L = thay đổi luồng dữ liệu/kiến trúc. Chưa chốt ngày release khi chưa có số đo máy mục tiêu.

### Phase 0 — Thu gọn scope (S)

- [x] P0-01: Gỡ entry/import cờ tướng khỏi registry và control/nhánh UI khỏi app.
- [x] P0-02: Gỡ `js/xiangqi/` và trang `xiangqi-test.html`; cập nhật README và hướng dẫn repo.
- [x] P0-03: Giữ hai slot ID legacy ở giá trị 1 để lịch sử bốn game còn lại không đổi ID
  khi bỏ control cờ tướng. Việc bỏ slot sẽ làm ở migration phase 1.
- [x] P0-04: Tạo file plan với phạm vi, ưu tiên, phụ thuộc và tiêu chí hoàn thành.

**Nghiệm thu:** dropdown chỉ còn 4 game; import không trỏ vào file đã gỡ;
Start/đổi game không lỗi; ID lịch sử bốn game giữ nguyên với các cấu hình hợp lệ trước đây.
Không tự xóa localStorage cờ tướng cũ: app không đọc nó, tránh tác động vào dữ liệu trình duyệt.

### Phase 1 — Đúng dữ liệu và ổn định vòng đời (L)

File chính: `js/storage.js`, `js/ga.js`, `js/nn.js`, `js/main.js`, `js/ui.js`.

- [x] P1-01: Có hàm normalize/validate settings dùng chung. Chỉ lấy option có nghĩa cho game;
  giới hạn số nguyên population 10–500, hidden 2–32, lookahead 1–3, depth 1–3,
  seeds theo danh sách hỗ trợ; mutation hữu hạn trong 0,01–0,5; target rỗng hoặc dương.
- [x] P1-02: Version hóa dữ liệu lưu, gồm `schemaVersion`, `envVersion`, `algorithmVersion`,
  game, kiến trúc, settings và metadata. Migration phải đọc được lịch sử hiện tại,
  hợp nhất cấu hình trùng sau normalize và không xóa dữ liệu gốc trước khi ghi thành công.
  Khi nhiều ID cũ về cùng ID mới, giữ mọi snapshot nguồn trong bản backup migration;
  chọn champion theo metric cùng phiên bản đã kiểm chứng (record legacy chưa kiểm chứng giữ riêng),
  chọn latest theo timestamp, không suy ra latest từ score. Migration phải idempotent và
  không áp dụng giới hạn 10 mục vào backup; cho người dùng khôi phục/xuất các nguồn chưa được chọn.
- [x] P1-03: Tách `champion` có genome + metric + seed đã lập thành tích khỏi `latestPopulation`
  dùng gây giống tiếp. UI và resume cho biết lấy từ mục nào; chỉ ghi record khi có bằng chứng cùng genome.
  Với dữ liệu cũ không chứng minh được liên kết, ghi rõ record legacy chưa được kiểm chứng lại.
  `latestPopulation` là quần thể đã đánh giá của gen N, không phải offspring;
  học tiếp từ đó gây giống gen N+1. Muốn resume chính xác giữa episode cần checkpoint khác,
  nằm ngoài v0; snapshot v0 không được quảng bá như checkpoint đó.
- [x] P1-04: Thu metric từng cá thể trên từng seed: fitness trung bình để selection,
  score trung bình cho trend, score tối đa làm record và seed đi kèm. Snapshot chốt trước reset/evolve;
  số thế hệ trên snapshot phải là thế hệ đã đánh giá, không phải thế hệ mới vừa sinh.
- [x] P1-05: Validate shape/length genome, số hữu hạn, game và version trước resume;
  dữ liệu hỏng phải có thông báo, không âm thầm biến thành lượt học từ đầu.
- [x] P1-06: Trả trạng thái ghi thật từ storage và hiển thị lưu thành công/không lưu được.
  Huấn luyện tiếp tục khi storage bị chặn, không thông báo đã lưu sai.
- [x] P1-07: Định nghĩa state `idle/running/paused/finished/comparing`; Stop và Reset hủy công việc
  liên quan đúng lúc. Resume khi Pause tiếp tục chính Trainer; học tiếp từ snapshot sau Stop
  là gây giống mới và phải được ghi nhãn rõ, không gọi là khôi phục toàn bộ trạng thái.
- [x] P1-08: Trần tick/episode theo game, trần generation hoặc thời gian theo lựa chọn;
  đánh dấu `done` và `truncated` riêng. Áp dụng cùng giới hạn cho các bên được so sánh.

**Nghiệm thu:** test trường hợp thế hệ sau kém record, champion score khác cá thể fitness cao nhất,
hai seed có score khác nhau, resume genome sai chiều, JSON hỏng, storage fail và migrate ID cũ.
Pause không làm tiến thêm tick; Reset không để callback cũ cập nhật lượt mới.

### Phase 2 — Trải nghiệm lần đầu và điều khiển (M)

File chính: `index.html`, `style.css`, `js/ui.js`, `js/analysis.js`, `js/main.js`.

- [ ] P2-01: Đặt Flappy mặc định tường minh; preset theo game (`Nhanh`, `Cân bằng`, `Thử nghiệm`).
  Công khai cấu hình preset; không tự đổi tham số một lượt đang chạy.
- [ ] P2-02: Màn hình đầu ưu tiên game, preset, Start và giải thích ngắn “AI thử → chọn lọc → thế hệ mới”.
  Đưa số node, mutation, lookahead, feature và expectimax vào vùng nâng cao mở được.
- [ ] P2-03: Tách nút Pause/Resume và Stop; sau Stop có “Học tiếp từ bản đã lưu” và “Chạy mới”.
  Reset xóa trạng thái phiên hiện tại; xóa lịch sử là thao tác riêng có nhãn đúng tác động.
- [ ] P2-04: Hiện game score, fitness, generation và tiến độ seed đang đánh giá với nhãn rõ;
  giữ chart chính dễ thấy, cho mở thêm network/rank/heatmap/histogram khi muốn tìm hiểu.
- [ ] P2-05: Gợi ý tổng kết theo game và số mẫu. Dao động/chững lại là quan sát,
  không đủ để khẳng định mutation là nguyên nhân. Mỗi thử nghiệm gợi ý đổi một biến;
  không áp dụng cấu hình làm genome mất tương thích vào nút học tiếp.
- [ ] P2-06: Layout một cột ở màn hình nhỏ; bỏ sidebar cố định 800px tại breakpoint;
  canvas giữ tỷ lệ; focus nhìn thấy, label đầy đủ, modal đóng bằng Escape và trả focus.

**Nghiệm thu:** người mới bắt đầu bằng game + preset + Start trong tối đa 3 thao tác;
Start/Pause/Resume/Stop/Reset và chọn lịch sử dùng được bằng bàn phím. Kiểm tra 390px,
768px, 1366px, zoom 200%; không mất control hay cuộn ngang toàn trang.

### Phase 3 — Kiểm chứng AI học và so sánh công bằng (L)

File chính: `js/compare.js`, `js/ga.js`, `js/nn.js`, `js/ui.js`; thêm module benchmark/RNG nhỏ nếu cần.

- [ ] P3-01: RNG có master seed cho khởi tạo NN, selection, crossover, mutation và map;
  seed stream train/evaluate tách riêng, lưu cùng config/version. Replay tái lập trong cùng
  implementation/runtime; chưa cam kết giống từng bit trên mọi browser.
- [ ] P3-02: Giữ compare trực quan một map để xem hành vi, thêm đánh giá nhiều map:
  mặc định 10 seed chưa dùng huấn luyện, cho chọn 5/10/20 ở phần nâng cao.
- [ ] P3-03: Đóng băng genome trước/sau và config khi bắt đầu benchmark; hai bên cùng seed,
  cùng luật và trần episode. Hiện tiến độ, cho hủy; không dùng kết quả dở như kết quả hoàn chỉnh.
- [ ] P3-04: Báo số episode, mean/median score, độ phân tán, tỷ lệ đạt target, win/tie/loss
  theo từng cặp seed và số episode chạm trần. Tách metric game khỏi fitness huấn luyện.
- [ ] P3-05: Baseline là best genome của thế hệ đầu **phiên này**; khi resume phải ghi đúng
  nguồn/gen bắt đầu, không gọi baseline là AI ngẫu nhiên. Không kết luận chắc chắn từ 10 ván.
- [ ] P3-06: Mở lựa chọn “Số map/thế hệ” cho cả 4 game, bỏ tên riêng “dàn ống” ở control chung;
  preset cấu hình nhiều seed phải được đo về độ ổn định và chi phí trước khi làm mặc định.

**Nghiệm thu:** cùng genome/config/evaluation seed cho cùng kết quả khi replay;
đổi tốc độ/render không đổi bước mô phỏng; benchmark không mutate Trainer hoặc genome nguồn;
ghi đúng khi không cải thiện, hòa, bị hủy hoặc truncated.

### Phase 4 — Hiệu năng và bảo vệ trải nghiệm (M; L nếu cần Worker)

- [ ] P4-01: Đo tick/frame, thời gian một generation, độ trễ control và bộ nhớ với 4 game,
  preset thường, population tối đa và 2048 expectimax depth 3. Ghi máy/browser/settings thực tế.
- [ ] P4-02: Giới hạn thời gian mô phỏng mỗi frame (mốc khởi đầu 8–12ms), yield để nhận input,
  throttle DOM/chart/network, giới hạn số điểm chart bằng downsampling giữ extrema.
  Trần tick không được tự đổi dựa trên FPS vì sẽ thay luật theo máy.
- [ ] P4-03: Khi tab ẩn, mặc định pause và hiện trạng thái khi quay lại; tránh trình duyệt
  throttle rAF làm người dùng tưởng training vẫn chạy đều. Đo khả năng chạy 30 phút.
- [ ] P4-04: Nếu cấu hình được hỗ trợ vẫn chặn control, dùng ES module Worker cho train/benchmark.
  Gửi snapshot render có giới hạn tần suất; DOM và localStorage ở main thread; message có run ID
  để bỏ dữ liệu phiên cũ; Worker có trần batch, hủy và xử lý lỗi. Nếu chưa làm, giới hạn cấu hình
  nặng tường minh và ghi rõ phạm vi được hỗ trợ trước release.

**Gate release:** control phản hồi dưới 200ms và render ít nhất 30 FPS ở preset thường
trên máy được ghi trong QA. Chốt danh sách preset/cấu hình được hỗ trợ và máy QA trước khi
đo để không chọn lại phạm vi sau khi thấy kết quả; kết quả chưa đo không đánh dấu đạt. Memory/history có giới hạn;
chạy 30 phút không tăng vô hạn, không treo khi Stop/Reset trong train/compare.

Worker là hướng có căn cứ vì chạy tính toán ở background và trao đổi qua message;
không truy cập DOM trực tiếp từ Worker. Xem [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).
Web Storage là API đồng bộ, nên cần hạn chế ghi trong luồng nóng;
xem [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API).
Chính sách tab ẩn cần chủ động vì rAF thường dừng khi tab ở background;
xem [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

### Phase 5 — Tài liệu, QA và chốt v0 (M)

- [ ] P5-01: Bổ sung `docs/introduce/snake.md`, `2048.md`, `hillclimb.md` theo mẫu Flappy;
  cập nhật mẫu Flappy theo thay đổi seed/metric. Nội dung: input, output, reward, score,
  điều kiện kết thúc, điều có thể quan sát và giới hạn kết luận.
- [ ] P5-02: Đồng bộ ghi chú cải tiến với source; ví dụ phần đầu `docs/improve/2048.md`
  còn mô tả vấn đề đã được xử lý ở bảng trạng thái phía dưới. Phân biệt lịch sử và hạn chế hiện tại.
- [ ] P5-03: README có quick start, preset, cách học tiếp, giới hạn lưu trên browser,
  metric/benchmark và cách tái lập; không tuyên bố khả năng AI chưa có bằng chứng.
- [ ] P5-04: Thêm kiểm tra tự động nhỏ cho invariants RNG/environment/storage/lifecycle;
  dùng runner nhẹ và harness riêng nếu cần, không đưa build step vào đường chạy app.
- [ ] P5-05: QA trên Chrome và Firefox desktop hiện hành, Safari nếu môi trường kiểm tra cho phép;
  ghi version thật và browser chưa kiểm tra. Smoke mobile viewport; không hứa tương thích chưa đo.
- [ ] P5-06: Ghi kết quả trong `docs/qa/v0.md`: cấu hình, seed, metric, hiệu năng, lỗi còn lại,
  trạng thái pass/fail. Chỉ phát hành khi tất cả P0 đạt; hosting static là bước riêng nếu triển khai.

**Checklist release:**

- [ ] Cả 4 game chạy ít nhất 3 thế hệ; settings đúng kiến trúc với các option động.
- [ ] Start/Pause/Resume/Stop/Reset, target stop và episode limit đúng trạng thái.
- [ ] History save/reload/resume/delete, migration và storage fail không mất dữ liệu ngoài ý muốn.
- [ ] Champion/gen/score khớp; nhiều seed không lấy nhầm score của seed cuối.
- [ ] Compare một map và benchmark nhiều map đúng seed, hủy được, không ghi đè phiên mới.
- [ ] Responsive/bàn phím/modal, smoke browser và các mốc hiệu năng đạt bằng số đo.
- [ ] Console không có lỗi chưa xử lý; README/tài liệu phản ánh hành vi đã kiểm tra.

## 5. Đề xuất làm thêm sau khi P0 ổn

1. **Export/import JSON (P1, M):** chứa champion + snapshot, version, game, config, seed,
   metric; giới hạn dung lượng/số cá thể và validate toàn bộ trước import. Có preview thông tin,
   không tự ghi đè lịch sử. Đây là đề xuất đầu tiên sau v0 vì dữ liệu hiện chỉ nằm trong browser.
2. **Replay champion + CSV benchmark (P1, S–M):** xem lại hành vi của chính gen đã lưu,
   xuất bảng seed/score/truncated để phân tích bên ngoài. Không phải replay trajectory đầy đủ.
3. **Experiment notebook/A-B (P2, L):** lưu nhiều trial của cùng cấu hình thay vì chỉ record;
   mỗi lần đổi một biến, dùng cùng bộ seed đánh giá và cùng ngân sách tick/thời gian.
   Chạy nhiều training master seed để tách phương sai huấn luyện khỏi phương sai map.
4. **Thử thuật toán theo benchmark (P2, M–L):** neuron crossover trước; đối xứng bàn 2048
   tiếp theo. Curriculum và shaping cần benchmark trên luật gốc; version reward/environment
   để lịch sử cũ không bị so như cùng bài toán. Giữ quyết định hiện tại về mục tiêu max tile 2048
   cho tới khi có thử nghiệm chứng minh cần đổi; không tự chuyển fitness chỉ vì một tài liệu cũ đề xuất.

## 6. Cách theo dõi tiến độ

Mỗi task dùng ID phase ở trên; triển khai theo nhóm thay đổi nhỏ có thể review.
Chỉ tick hoàn thành khi hành vi đã chạy đúng và có bằng chứng phù hợp; sau mỗi phase ghi
file đổi, kiểm tra, hạn chế và task tiếp theo vào mục này. Không cần đo toàn bộ thuật toán
cho một chỉnh sửa tài liệu hoặc gỡ control.

| Phase | Trạng thái | Bằng chứng / điều kiện tiếp theo |
|---|---|---|
| 0 | Hoàn thành | Gỡ cờ tướng; smoke 4 game/8 cấu hình, 3 generation/cấu hình; ID legacy, save/resume, compare và import/DOM references đạt |
| 1 | Hoàn thành | P1-01–08; 27 nhóm test + DOM/import; Chrome lưu gen 3, resume/lưu gen 4; [QA phase 1](docs/qa/phase-1.md) |
| 2 | Chưa bắt đầu | Cần lifecycle và settings chuẩn hóa của phase 1 |
| 3 | Chưa bắt đầu | Cần snapshot/metric đúng của phase 1; UI kết quả nối vào phase 2 |
| 4 | Chưa bắt đầu | Đo sớm; chốt optimization/Worker sau khi có số liệu |
| 5 | Chưa bắt đầu | Thu bằng chứng xuyên suốt; chốt release sau các gate P0 |

**Việc làm ngay tiếp theo:** phase 2, bắt đầu P2-01 (Flappy mặc định + preset) và P2-02
(luồng lần chạy đầu). Stop riêng và control map chung đã được đưa lên phase 1 để hoàn thiện
lifecycle và khóa đúng cấu hình; các task phase 2/3 còn lại vẫn giữ trạng thái chưa hoàn thành.

**Kiểm tra phase 0 (02/10/2026):** harness tạm trên Node 16 kiểm tra 4 game với Flappy
lookahead 1/2/3, 2048 depth 1/2/3 (depth 3 bật đủ 4 feature), Snake và Hill Climb.
Mỗi cấu hình chạy 3 thế hệ với trần 12 tick để smoke lifecycle, không đo chất lượng học.
ID lịch sử được đối chiếu với `storage.js` trước thay đổi; save/resume và compare chạy được;
mọi relative import và tham chiếu DOM hợp lệ; `git diff --check` đạt.
Smoke Chrome xác nhận dropdown 4 game, Start cả 4 game, Pause/Stop/tổng kết Flappy
và Reset về generation 0. Log thu được không có lỗi từ app; có lỗi sync của extension trình duyệt.
Đây chưa phải QA v0 ở phase 5. Plan đã qua bước đọc độc lập, bổ sung quy tắc migration trùng ID,
thế hệ của latest snapshot và gate hiệu năng để tránh triển khai lệch nghĩa.

**Kiểm tra phase 1 (03/10/2026):** hoàn thành normalize/settings, schema v2 + backup/migration,
champion/latest riêng, metric multi-seed, validate genome/version, trạng thái lưu thật,
state phiên + hủy callback cũ và trần episode/generation/thời gian. Chi tiết bằng chứng,
quy tắc migration và hạn chế ở [docs/qa/phase-1.md](docs/qa/phase-1.md).
