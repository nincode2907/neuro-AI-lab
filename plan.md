# Neuroevolution Lab — Product Plan

## North star

> Một playground nơi bất kỳ ai cũng có thể tạo, tiến hoá, chia sẻ và cạnh tranh
> với những **Brain** AI nhỏ tự học chơi game.

Sản phẩm không định vị là “demo thuật toán di truyền”. Trải nghiệm cốt lõi là:

```text
Watch → Train → Save Brain → Publish → Fork → Evolve → Compete
```

## Phạm vi Public v1

| Có trong v1 | Vai trò |
|---|---|
| 🐦 Flappy Bird | Onboarding; dễ thấy tiến hoá nhất |
| 🐍 Snake | Hành vi học trực quan: sống sót rồi săn mồi |
| 🔢 2048 | Brain có thể dùng làm advisor và benchmark |

Hill Climb và Cờ Tướng giữ trong source để nghiên cứu, nhưng **không public** trong v1.
Không mở lại hai game này trước khi ba game trên ổn định, có benchmark đáng tin và có người dùng quay lại.

## Nguyên tắc sản phẩm

1. Training chạy ở browser của người dùng; server không trả chi phí train quần thể.
2. Client có thể hiển thị personal record, nhưng leaderboard chỉ dùng kết quả server verify.
3. Brain chỉ là data JSON, tuyệt đối không nhận JavaScript executable.
4. Genome chỉ train tiếp được khi environment version, sensor schema và network topology tương thích.
5. `Fork from champion` khác với `Resume checkpoint`:
   - Fork chỉ cần champion genome, phù hợp để chia sẻ/cộng đồng.
   - Resume chính xác cần cả population, RNG state và GA state.
6. 2048 policy thuần và 2048 + expectimax là hai nhóm benchmark riêng.

---

## Phase 0 — Public Alpha

**Mục tiêu:** người mới vào hiểu trong vài giây rằng họ đang xem AI tự học, rồi muốn tự train một Brain.

### Deliverables

- [x] Chỉ mở Flappy, Snake, 2048 trong public registry.
- [x] `Khám phá` là UI mặc định: copy ngắn, nút bắt đầu rõ ràng, thông số nâng cao được giấu trong `AI Lab`.
- [x] AI Lab giữ các công cụ cho người thích đào sâu: hyperparameter, network graph, heatmap, chart, rank table.
- [x] Seeded experiment để tái lập training cùng seed + cấu hình.
- [x] Brain JSON có schema version, hash, architecture signature, champion result và lineage parent hash.
- [x] Import/export Brain; export chỉ hoạt động sau khi có champion hợp lệ.
- [x] Warm start từ Brain/saved champion, khóa các cấu hình làm đổi topology; N, mutation rate và số map mỗi thế hệ vẫn đổi được.
- [x] Share result qua Web Share API hoặc clipboard fallback.
- [x] Adaptive simulation budget để x50 không khóa UI, nhất là với 2048 expectimax.
- [x] Analytics funnel local-first; có thể cấu hình endpoint khi deploy.
- [x] Test deterministic RNG, genome validation, champion integrity, compatibility, registry và Brain round-trip.

### Success criteria

- Visitor có thể bắt đầu chạy Flappy mà không cần hiểu “fitness”, “gene” hay “mutation”.
- Không thể import genome sai topology hoặc Brain bị sửa mà không bị chặn.
- Cùng seed và cùng config cho lại cùng history/champion.
- 100% score public sau này có đủ dữ liệu để server chạy lại.

### Metrics cần đo khi public

| Funnel | Chỉ số cần theo dõi |
|---|---|
| First value | Visitor → Start Evolution |
| Engagement | Session > 5 phút; xem ≥ 5 generations |
| Intent | Chỉnh tham số; export Brain; share result |
| Product signal | Bắt đầu lần train thứ hai |

**Quyết định go/no-go:** tỷ lệ người bắt đầu train lần hai quan trọng hơn tổng visitor.

---

## Phase 1 — Brain Hub & verified competition

**Mục tiêu:** biến Brain từ file local thành một thực thể có thể publish, fork và cạnh tranh công bằng.

### Deliverables

- [x] Hub account: đăng ký, đăng nhập, session token.
- [x] Publish champion Brain từ Lab vào Hub.
- [x] Server validate schema/hash/compatibility trước khi nhận model.
- [x] Server evaluate lại mỗi Brain trên 7 hidden seeds cố định theo game + category.
- [x] Leaderboard xếp theo verified mean score; hiện median, min/max và số lần chạy.
- [x] Tách category `policy` và `expectimax` cho 2048.
- [x] Model page: author, architecture, parameter count, verified result, parent hash, descendants.
- [x] Fork & Evolve: lấy Brain public về Lab; Brain con tự lưu `parentHash` khi export/publish.
- [x] Không serve database nội bộ như static asset; production bắt buộc đặt `NEURO_HUB_SECRET`.

### Quy tắc benchmark v1

| Game | Verified metric | Ghi chú |
|---|---|---|
| Flappy | Mean score trên hidden seeds | Có median/min/max để thấy độ robust |
| Snake | Mean food/score trên hidden seeds | Bổ sung survival constraint khi tuning benchmark |
| 2048 | Mean score theo category | Policy và Expectimax không cạnh tranh trực tiếp |

### Success criteria

- User A publish Brain, User B fork được và train tiếp mà không sửa topology.
- Không thể chỉ sửa DevTools score để lên top leaderboard.
- Hai Brain cùng game/category được chạy trên **cùng** hidden seed pack.
- Model page trả lời được: ai tạo, score đã verify bao nhiêu, fork từ đâu, có bao nhiêu hậu duệ.

### Vận hành trước khi public thật

- [ ] Deploy server với persistent database/volume thay cho `.data/hub.json` nếu host không giữ filesystem.
- [ ] Đặt `NEURO_HUB_SECRET` riêng, ổn định và không commit vào repo.
- [ ] Thêm rate limit cho auth/publish và job queue/worker cho evaluator nếu traffic tăng.
- [ ] Monitoring cho API latency, evaluator failures và publish rejection rate.
- [ ] Viết seed rotation/versioning policy: không đổi benchmark lặng lẽ; mọi thay đổi tạo evaluation version mới.

---

## Phase 2 — Challenges & retention

**Mục tiêu:** tạo lý do để quay lại, thay vì chỉ xem AI học một lần rồi rời đi.

### Ưu tiên

1. Weekly challenge với seed pack và luật khóa cố định.
2. Tiny Brain Challenge: giới hạn hidden nodes/parameter/lookahead.
3. Fastest Learner: giới hạn generation hoặc simulation budget.
4. Most Robust Brain: ưu tiên mean/median hơn kỷ lục một seed.
5. Replay share link: một run/milestone dễ post lên mạng xã hội.
6. Achievement cho milestone: first pipe, first food, first 2048 tile, first verified publish.
7. AI vs Human / 2048 advisor polish sau khi benchmark đã rõ.

### Không làm ở Phase 2

- Social feed, comment, direct message, follow graph.
- Cloud training trả phí.
- Thêm game mới chỉ để tăng số lượng.

### Success criteria

- Fork rate và returning users tăng rõ sau challenge.
- Người dùng không chỉ xem champion mà có động lực thử config/Brain khác.

---

## Phase 3 — Open Lab

**Mục tiêu:** mở rộng từ product cho 3 game thành nền tảng thử nghiệm evolutionary agents.

### Điều kiện vào phase

- Public v1 ổn định; benchmark versioning rõ ràng.
- Có retention từ Hub/challenge, không chỉ traffic một lần.
- Evaluator server đã tách job và có khả năng scale.

### Hướng phát triển

- Custom environment SDK với deterministic evaluator contract.
- Custom benchmark rules và seed pack versioning.
- Checkpoint chuẩn cho resume thật sự.
- Thuật toán mới: NEAT, evolution strategies, hoặc hybrid RL — mỗi loại phải có leaderboard class riêng.
- Classroom mode: teacher tạo experiment/challenge, learner submit Brain.
- Quay lại đánh giá Hill Climb và Cờ Tướng như project riêng, không kéo vào public v1 chỉ vì “có thêm game”.

---

## Backlog kỹ thuật theo ưu tiên

### P0 — trước deploy production

- Persistent DB/volume, secret management, HTTPS và backup.
- Rate limiting auth/publish; giới hạn payload, model size và evaluator time.
- Worker/job queue cho server verification để publish 2048 không block request khác.
- API integration tests: register/login/publish/duplicate/tampered Brain/fork/leaderboard category.
- Visual QA trên desktop + mobile cho Lab và Hub.

### P1 — sau deploy, theo tín hiệu người dùng

- Challenge data model + admin seed pack.
- Model replay/watch page.
- Profile tối giản: published Brains, forks, verified records.
- Benchmark version label trên mỗi leaderboard.

### P2 — chỉ khi retention chứng minh nhu cầu

- Cloud fast training / private Brain / classroom premium.
- Social graph, comments, notifications.
- WASM/SIMD/GPU acceleration.
- Game thứ tư.

## Quyết định chưa cần đưa ra ngay

- Chọn hosting/database cụ thể.
- Monetization và paywall.
- Có mở source custom environment hay không.
- Có đưa Hill Climb/Cờ Tướng trở lại hay không.

Các quyết định này chỉ nên chốt sau khi có dữ liệu từ Public Alpha và Brain Hub.
