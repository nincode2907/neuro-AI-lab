/**
 * nn.js — Mạng nơ-ron feedforward tự viết, chỉ dùng phép nhân ma trận cơ bản.
 *
 * Đây là "BỘ NÃO" (Agent) của mỗi cá thể trong quần thể:
 *   inputs (giác quan từ game) --> lớp ẩn (tanh) --> outputs (sigmoid 0..1)
 *
 * Với neuroevolution, ta KHÔNG dùng backpropagation. Toàn bộ trọng số của
 * mạng được coi là "GEN" (một mảng số phẳng). Thuật toán di truyền (ga.js)
 * sẽ lai ghép + đột biến các gen này qua từng thế hệ — mạng nào cho hành vi
 * sống lâu hơn thì gen của nó được nhân giống nhiều hơn. Đó chính là "học".
 */

/** Sinh số ngẫu nhiên theo phân phối chuẩn (Box–Muller) — dùng để khởi tạo & đột biến. */
export function randGaussian(mean = 0, std = 1, random = Math.random) {
  const u1 = random() || 1e-9; // tránh log(0)
  const u2 = random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export class NeuralNetwork {
  /**
   * @param {number[]} sizes — số node từng lớp, ví dụ [4, 8, 1]
   *   = 4 inputs, 8 node ẩn, 1 output.
   */
  constructor(sizes, random = Math.random, initialize = true) {
    this.sizes = [...sizes];

    // weights[l] là ma trận (sizes[l+1] x sizes[l]),
    // biases[l] là vector (sizes[l+1]).
    // Khởi tạo ngẫu nhiên nhỏ — thế hệ 0 hành động hoàn toàn "mù".
    this.weights = [];
    this.biases = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const rows = sizes[l + 1];
      const cols = sizes[l];
      const w = new Float64Array(rows * cols);
      const b = new Float64Array(rows);
      // Xavier-ish init: chia theo căn số input để output không bão hoà
      const scale = 1 / Math.sqrt(cols);
      if (initialize) {
        for (let i = 0; i < w.length; i++) w[i] = randGaussian(0, scale, random);
        for (let i = 0; i < b.length; i++) b[i] = randGaussian(0, scale, random);
      }
      this.weights.push(w);
      this.biases.push(b);
    }
  }

  /**
   * Lan truyền tiến: inputs -> outputs.
   * Mỗi lớp: out = activation(W · in + b)  — chính là phép nhân ma trận-vector.
   * @param {number[]} inputs — mảng đã chuẩn hoá từ env.getInputs()
   * @returns {number[]} outputs trong khoảng 0..1 (sigmoid)
   */
  forward(inputs) {
    let a = inputs;
    // Lưu lại giá trị kích hoạt từng lớp để UI vẽ "bộ não đang suy nghĩ"
    this.activations = [inputs];
    for (let l = 0; l < this.weights.length; l++) {
      const rows = this.sizes[l + 1];
      const cols = this.sizes[l];
      const w = this.weights[l];
      const b = this.biases[l];
      const out = new Array(rows);
      const isLast = l === this.weights.length - 1;
      for (let i = 0; i < rows; i++) {
        let sum = b[i];
        for (let j = 0; j < cols; j++) sum += w[i * cols + j] * a[j];
        // Lớp ẩn dùng tanh (-1..1), lớp output dùng sigmoid (0..1)
        out[i] = isLast ? 1 / (1 + Math.exp(-sum)) : Math.tanh(sum);
      }
      a = out;
      this.activations.push(out);
    }
    return a;
  }

  /** Trải phẳng toàn bộ trọng số thành 1 mảng — đây chính là "GEN" của cá thể. */
  getGenes() {
    let total = 0;
    for (let l = 0; l < this.weights.length; l++) {
      total += this.weights[l].length + this.biases[l].length;
    }
    const genes = new Float64Array(total);
    let k = 0;
    for (let l = 0; l < this.weights.length; l++) {
      genes.set(this.weights[l], k); k += this.weights[l].length;
      genes.set(this.biases[l], k);  k += this.biases[l].length;
    }
    return genes;
  }

  /** Nạp gen (mảng phẳng) trở lại thành trọng số của mạng. */
  setGenes(genes) {
    if (!genes || genes.length !== NeuralNetwork.geneCount(this.sizes)) {
      throw new Error(`Genome không tương thích với mạng ${this.sizes.join('→')}.`);
    }
    // JSON.parse() trả Array thường, còn lai ghép nội bộ dùng Float64Array.
    // Chuẩn hoá một lần để cả Brain import và checkpoint local đều nạp được.
    const values = ArrayBuffer.isView(genes) ? genes : Float64Array.from(genes);
    for (const value of values) {
      if (!Number.isFinite(value)) throw new Error('Genome chứa trọng số không hợp lệ.');
    }
    let k = 0;
    for (let l = 0; l < this.weights.length; l++) {
      this.weights[l].set(values.subarray(k, k + this.weights[l].length));
      k += this.weights[l].length;
      this.biases[l].set(values.subarray(k, k + this.biases[l].length));
      k += this.biases[l].length;
    }
  }

  /** Tạo bản sao độc lập (dùng khi giữ elite qua thế hệ mới). */
  clone() {
    const nn = new NeuralNetwork(this.sizes, Math.random, false);
    nn.setGenes(this.getGenes());
    return nn;
  }

  /** Tạo mạng mới từ gen có sẵn (kết quả lai ghép của ga.js). */
  static fromGenes(sizes, genes) {
    const nn = new NeuralNetwork(sizes, Math.random, false);
    nn.setGenes(genes);
    return nn;
  }

  /** Số tham số chính xác của một kiến trúc, dùng để validate file Brain. */
  static geneCount(sizes) {
    let total = 0;
    for (let l = 0; l < sizes.length - 1; l++) total += sizes[l] * sizes[l + 1] + sizes[l + 1];
    return total;
  }
}
