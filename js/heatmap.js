/**
 * heatmap.js — Quét lưới TOÀN BỘ tổ hợp giá trị có thể của 2 input được chọn,
 * hỏi mạng nơ-ron "sẽ quyết định gì?" ở MỖI ô lưới — không cần chơi thật.
 *
 * Đây là kiểu "policy heatmap" kinh điển trong RL: thay vì chỉ xem 1 quỹ đạo
 * chơi thật (phụ thuộc may rủi gặp tình huống nào), heatmap cho thấy TOÀN BỘ
 * ranh giới quyết định của agent tại 1 thời điểm — thế hệ đầu: loang lổ ngẫu
 * nhiên (mạng chưa học được quy luật gì). Thế hệ sau: đường ranh giới rõ nét
 * (mạng đã học "input nào thì làm gì" nhất quán).
 *
 * Hàm THUẦN (không đụng DOM/canvas) — ui.js lo phần vẽ, file này chỉ tính số.
 */

/**
 * @param {NeuralNetwork} net — mạng cần khảo sát (KHÔNG phải mạng đang chơi
 *   thật — dùng 1 mạng "chỉ để hỏi", tránh ghi đè net.activations của mạng
 *   đang chơi thật mà "Bộ não realtime" đọc mỗi frame).
 * @param {{xIndex:number, yIndex:number}} heatmapAxes — chỉ số 2 input để quét
 * @param {number} resolution — số ô lưới mỗi cạnh (vd 48 => lưới 48x48)
 * @returns {Float64Array[]} grid[row][col] = outputs[0] của mạng tại
 *   (input[yIndex]=row/(resolution-1), input[xIndex]=col/(resolution-1)),
 *   các input khác giữ trung tính 0.5. row=0 ứng với giá trị Y=0.
 */
export function computeHeatmapGrid(net, heatmapAxes, resolution = 48) {
  const { xIndex, yIndex } = heatmapAxes;
  const nInputs = net.sizes[0];
  const grid = [];

  for (let row = 0; row < resolution; row++) {
    const rowVals = new Float64Array(resolution);
    const yVal = resolution === 1 ? 0.5 : row / (resolution - 1);
    for (let col = 0; col < resolution; col++) {
      const xVal = resolution === 1 ? 0.5 : col / (resolution - 1);
      const inputs = new Array(nInputs).fill(0.5); // input không được quét: giữ trung tính
      inputs[xIndex] = xVal;
      inputs[yIndex] = yVal;
      const out = net.forward(inputs);
      rowVals[col] = out[0]; // quy ước: outputs[0] là quyết định nhị phân (vd "nhảy")
    }
    grid.push(rowVals);
  }
  return grid;
}
