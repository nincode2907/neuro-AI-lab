import { NeuralNetwork } from './nn.js';

export const BRAIN_SCHEMA = 'neuro-lab/brain';
export const BRAIN_SCHEMA_VERSION = 1;

/** Dấu vân tay nhỏ, ổn định để nhận diện Brain mà không cần thư viện crypto. */
export function hashBrainPayload(payload) {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createBrain({ game, environmentVersion, architecture, champion, training, parentHash = null }) {
  if (!champion) throw new Error('Chưa có champion để tạo Brain.');
  const payload = {
    schema: BRAIN_SCHEMA,
    schemaVersion: BRAIN_SCHEMA_VERSION,
    game,
    environmentVersion,
    architecture,
    genome: [...champion.genes],
    result: {
      verification: 'local-training',
      score: champion.score,
      fitness: champion.fitness,
      generation: champion.generation,
      evaluationSeeds: [...(champion.evaluationSeeds || [])],
    },
    lineage: { parentHash },
    training: {
      experimentSeed: training.experimentSeed,
      population: training.population,
      mutationRate: training.mutationRate,
    },
  };
  return { ...payload, hash: hashBrainPayload(payload), exportedAt: new Date().toISOString() };
}

export function validateBrain(brain) {
  if (!brain || typeof brain !== 'object' || Array.isArray(brain)) {
    throw new Error('File Brain phải là một object JSON.');
  }
  if (brain.schema !== BRAIN_SCHEMA || brain.schemaVersion !== BRAIN_SCHEMA_VERSION) {
    throw new Error('Phiên bản Brain không được hỗ trợ.');
  }
  if (!['flappy', 'snake', '2048'].includes(brain.game)) {
    throw new Error('Game trong Brain không thuộc Public v1.');
  }
  const sizes = brain.architecture?.networkSizes;
  if (!Array.isArray(sizes) || sizes.length !== 3 || sizes.some((n) => !Number.isInteger(n) || n < 1 || n > 256)) {
    throw new Error('Kiến trúc mạng không hợp lệ.');
  }
  const expected = NeuralNetwork.geneCount(sizes);
  if (!Array.isArray(brain.genome) || brain.genome.length !== expected) {
    throw new Error(`Genome không đúng độ dài: cần ${expected} tham số.`);
  }
  if (brain.genome.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6)) {
    throw new Error('Genome chứa trọng số không hợp lệ.');
  }
  if (!Number.isFinite(brain.result?.score) || !Number.isFinite(brain.result?.fitness)) {
    throw new Error('Kết quả đi kèm Brain không hợp lệ.');
  }
  if (brain.result.verification !== 'local-training') {
    throw new Error('Trạng thái đánh giá của Brain không hợp lệ.');
  }
  if (!Number.isInteger(brain.result.generation) || brain.result.generation < 1) {
    throw new Error('Thế hệ của Brain không hợp lệ.');
  }
  if (!Array.isArray(brain.result.evaluationSeeds)
    || brain.result.evaluationSeeds.some((seed) => !Number.isInteger(seed) || seed < 0)) {
    throw new Error('Evaluation seed của Brain không hợp lệ.');
  }
  if (brain.lineage?.parentHash !== null
    && !/^[0-9a-f]{8}$/.test(brain.lineage?.parentHash || '')) {
    throw new Error('Dòng dõi của Brain không hợp lệ.');
  }
  const { hash, exportedAt: _exportedAt, ...payload } = brain;
  if (hash !== hashBrainPayload(payload)) throw new Error('Brain đã bị thay đổi hoặc file bị hỏng.');
  return brain;
}

export function brainFilename(brain) {
  return `${brain.game}-brain-${brain.hash}.json`;
}

export function downloadBrain(brain) {
  const blob = new Blob([JSON.stringify(brain, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = brainFilename(brain);
  link.click();
  URL.revokeObjectURL(url);
}
