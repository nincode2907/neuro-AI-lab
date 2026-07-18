/**
 * analysis.js — Tổng kết một lần chạy + ĐỀ XUẤT thay đổi chỉ số.
 *
 * Đây KHÔNG phải phần của thuật toán học — nó chỉ đọc lịch sử (history) mà
 * Trainer đã ghi lại rồi rút ra vài nhận xét bằng heuristic đơn giản, dễ hiểu:
 *   - Quần thể còn đang tiến bộ hay đã chững lại?
 *   - Fitness có dao động thất thường (đột biến quá cao) không?
 *   - Score đã "cất cánh" chưa hay vẫn kẹt ở giai đoạn học sống sót?
 * Từ đó gợi ý người dùng nên chỉnh N / đột biến / node ẩn thế nào cho lần sau.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

/**
 * @param {Trainer} trainer — đã chạy xong (dùng trainer.history)
 * @param {object} settings — thông số đang dùng { popSize, mutationRate, hiddenNodes }
 * @param {'target'|'manual'} reason — vì sao dừng
 * @returns {object} dữ liệu để UI hiển thị bảng tổng kết
 */
export function analyzeRun(trainer, settings, reason) {
  const h = trainer.history;
  const gens = h.length;
  const scoreLabel = trainer.envConfig.scoreLabel || 'Score';

  // --- Số liệu tổng quan ---
  const summary = {
    reason,
    scoreLabel,
    generations: gens,
    bestFitness: Math.round(trainer.bestEver),
    bestScore: trainer.bestEverScore,
    finalAvg: gens ? Math.round(h[h.length - 1].avg) : 0,
    trendText: '',
    suggestions: [],
  };

  if (gens < 3) {
    summary.trendText = `Mới chạy ${gens} thế hệ — quá ngắn để đánh giá xu hướng.`;
    summary.suggestions.push({
      title: 'Chạy lâu hơn',
      detail: 'Để ít nhất 20–30 thế hệ rồi hãy đánh giá; vài thế hệ đầu gần như chỉ là may rủi.',
    });
    return summary;
  }

  // --- So sánh nửa cuối vs nửa giữa để đo "còn đang tiến bộ không" ---
  const win = Math.max(3, Math.floor(gens * 0.3));
  const recent = h.slice(gens - win).map((d) => d.avg);
  const earlier = h.slice(Math.max(0, gens - 2 * win), gens - win).map((d) => d.avg);
  const avgRecent = mean(recent);
  const avgEarlier = mean(earlier);
  const improving = avgRecent > avgEarlier * 1.08; // tiến bộ >8% mới tính là "đang lên"

  // --- Độ dao động của đường best (đột biến quá cao => nhấp nhô) ---
  const bests = h.map((d) => d.best);
  const mBest = mean(bests) || 1;
  const variance = mean(bests.map((b) => (b - mBest) ** 2));
  const volatility = Math.sqrt(variance) / mBest; // hệ số biến thiên

  // --- Score đã "cất cánh" chưa ---
  const scoreTookOff = trainer.bestEverScore >= 3;

  // --- Mô tả xu hướng bằng lời ---
  if (reason === 'target') {
    summary.trendText = `🎯 Đạt mục tiêu sau ${gens} thế hệ! ` +
      (gens <= 15 ? 'Học rất nhanh.' : gens <= 40 ? 'Tốc độ học ổn định.' : 'Chậm mà chắc.');
  } else if (improving) {
    summary.trendText = `Vẫn đang tiến bộ (fitness trung bình nửa cuối cao hơn ~${Math.round((avgRecent / (avgEarlier || 1) - 1) * 100)}%). Dừng hơi sớm.`;
  } else {
    summary.trendText = `Đường học đã chững lại ${win} thế hệ gần đây — quần thể có vẻ kẹt ở một chiến thuật.`;
  }

  // ══════════════════ SINH ĐỀ XUẤT ══════════════════
  const s = settings;

  // Nếu đạt target nhanh → có thể chạy nhẹ hơn / đặt mục tiêu cao hơn
  if (reason === 'target') {
    if (gens <= 15 && s.popSize > 40) {
      summary.suggestions.push({
        title: `Giảm quần thể xuống ${Math.round(s.popSize / 2)}`,
        detail: `Đạt mục tiêu quá nhanh (${gens} thế hệ) — quần thể nhỏ hơn vẫn thừa sức mà chạy nhẹ, nhanh hơn.`,
      });
    }
    summary.suggestions.push({
      title: 'Đặt mục tiêu cao hơn',
      detail: `Best-ever đạt ${trainer.bestEverScore} ${scoreLabel.toLowerCase()}. Nâng điểm mục tiêu lên để xem AI học được tới đâu.`,
    });
  }

  // Đang tiến bộ mà bị dừng tay → cứ để chạy tiếp
  if (reason !== 'target' && improving) {
    summary.suggestions.push({
      title: 'Cứ để chạy tiếp — chưa cần đổi gì',
      detail: 'Fitness còn đang lên đều. Nhấn Start lại (giữ nguyên chỉ số) và để nó tiến hoá thêm vài chục thế hệ nữa.',
    });
  }

  // Chững lại → tuỳ nguyên nhân mà gợi ý khác nhau
  if (reason !== 'target' && !improving) {
    // (a) Đột biến quá thấp → tăng để thoát cực trị cục bộ
    if (s.mutationRate < 0.2) {
      const to = clamp(+(s.mutationRate + 0.08).toFixed(2), 0.05, 0.5);
      summary.suggestions.push({
        title: `Tăng đột biến ${s.mutationRate.toFixed(2)} → ${to}`,
        detail: 'Kẹt ở một chiến thuật thường do thiếu "ý tưởng mới". Tăng đột biến giúp quần thể thử phá cách để thoát cực trị cục bộ.',
      });
    }
    // (b) Đột biến quá cao + đường nhấp nhô → giảm để hội tụ
    if (s.mutationRate > 0.25 && volatility > 0.4) {
      const to = clamp(+(s.mutationRate - 0.08).toFixed(2), 0.02, 0.5);
      summary.suggestions.push({
        title: `Giảm đột biến ${s.mutationRate.toFixed(2)} → ${to}`,
        detail: `Fitness dao động mạnh (biến thiên ~${Math.round(volatility * 100)}%) — đột biến đang phá cả những gen tốt. Giảm lại để hội tụ ổn định hơn.`,
      });
    }
    // (c) Score chưa cất cánh + não nhỏ → tăng node ẩn
    if (!scoreTookOff && s.hiddenNodes < 16) {
      summary.suggestions.push({
        title: `Tăng node ẩn ${s.hiddenNodes} → ${Math.min(16, s.hiddenNodes * 2)}`,
        detail: `Score mới đạt ${trainer.bestEverScore} — có thể "bộ não" quá nhỏ để học hành vi phức tạp (vd: vừa né vừa tìm mồi). Cho nó nhiều node hơn.`,
      });
    }
    // (d) Quần thể nhỏ dễ kẹt
    if (s.popSize < 80) {
      summary.suggestions.push({
        title: `Tăng quần thể ${s.popSize} → ${s.popSize + 60}`,
        detail: 'Quần thể lớn thử nhiều chiến thuật song song hơn mỗi thế hệ, ít bị kẹt ở một lời giải.',
      });
    }
  }

  // Luôn có ít nhất một gợi ý
  if (summary.suggestions.length === 0) {
    summary.suggestions.push({
      title: 'Thử nghiệm tự do',
      detail: 'Kết quả đã khá tốt. Thử đổi một chỉ số duy nhất mỗi lần (vd tăng đột biến) để cảm nhận nó ảnh hưởng thế nào tới đường học.',
    });
  }

  return summary;
}
