/** Bộ sinh số giả ngẫu nhiên có seed, dùng chung cho quá trình tiến hoá. */
export class SeededRandom {
  constructor(seed = 1) {
    this.state = normalizeSeed(seed);
  }

  next() {
    let a = this.state | 0;
    a = (a + 0x6D2B79F5) | 0;
    this.state = a >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int31() {
    return Math.floor(this.next() * 0x80000000);
  }

  snapshot() {
    return this.state >>> 0;
  }
}

/** Chuẩn hoá seed về uint32; chuỗi bất kỳ được băm FNV-1a. */
export function normalizeSeed(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return (Math.trunc(numeric) >>> 0) || 1;
  const text = String(value ?? '1');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}

/** Seed mới cho một experiment; không tham gia vào tính tái lập sau khi đã tạo. */
export function createExperimentSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] || 1;
  }
  return normalizeSeed(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
}
