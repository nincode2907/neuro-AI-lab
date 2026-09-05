import assert from 'node:assert/strict';
import { SeededRandom } from '../js/random.js';
import { NeuralNetwork } from '../js/nn.js';
import { Trainer } from '../js/ga.js';
import { FlappyEnv } from '../js/environments/flappy.js';
import { registry } from '../js/environments/registry.js';
import { archOf, archId, saveRun, loadHistory } from '../js/storage.js';
import { createBrain, validateBrain } from '../js/brain.js';
import { evaluateBrain } from '../js/evaluator.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('SeededRandom tái lập đúng chuỗi', () => {
  const a = new SeededRandom(20260904);
  const b = new SeededRandom(20260904);
  assert.deepEqual(Array.from({ length: 20 }, () => a.next()), Array.from({ length: 20 }, () => b.next()));
});

test('NeuralNetwork từ chối genome sai hoặc không hữu hạn', () => {
  const sizes = [4, 3, 1];
  assert.equal(NeuralNetwork.geneCount(sizes), 19);
  assert.throws(() => NeuralNetwork.fromGenes(sizes, new Float64Array(3)), /không tương thích/);
  const invalid = new Float64Array(19);
  invalid[4] = Number.NaN;
  assert.throws(() => NeuralNetwork.fromGenes(sizes, invalid), /không hợp lệ/);
});

test('NeuralNetwork nạp được genome Array sau JSON round-trip', () => {
  const original = new NeuralNetwork([2, 3, 1]);
  const parsedGenes = JSON.parse(JSON.stringify(Array.from(original.getGenes())));
  const restored = NeuralNetwork.fromGenes([2, 3, 1], parsedGenes);
  assert.deepEqual(Array.from(restored.getGenes()), parsedGenes);
});

function finishGenerations(seed, count = 4) {
  const trainer = new Trainer({
    envFactory: (opts) => new FlappyEnv(opts),
    envConfig: FlappyEnv.configFor({ lookahead: 1 }),
    envOptions: { lookahead: 1 },
    popSize: 18,
    mutationRate: 0.1,
    hiddenNodes: 5,
    seedsPerGen: 2,
    maxStepsPerGen: 500,
    experimentSeed: seed,
  });
  while (trainer.generation <= count) {
    if (trainer.stepAll() === 0) trainer.onGenerationEnd();
  }
  return trainer;
}

test('Trainer cùng seed tạo cùng lịch sử và champion', () => {
  const a = finishGenerations(424242);
  const b = finishGenerations(424242);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(a.champion, b.champion);
});

test('Cả ba game public đều tái lập được theo experiment seed', () => {
  const run = (gameKey) => {
    const entry = registry[gameKey];
    const options = gameKey === 'flappy'
      ? { lookahead: 1 }
      : (gameKey === '2048' ? { searchDepth: 1, strategies: [] } : {});
    const config = entry.configFor ? entry.configFor(options) : entry.config;
    const trainer = new Trainer({
      envFactory: entry.create, envConfig: config, envOptions: options,
      popSize: 8, mutationRate: 0.12, hiddenNodes: 4,
      maxStepsPerGen: gameKey === '2048' ? 180 : 100,
      experimentSeed: 13579,
    });
    while (trainer.generation <= 2) {
      if (trainer.stepAll() === 0) trainer.onGenerationEnd();
    }
    return { history: trainer.history, champion: trainer.champion };
  };
  for (const key of ['flappy', 'snake', '2048']) assert.deepEqual(run(key), run(key));
});

test('Champion mang đúng score/fitness của chính genome trên đúng seed', () => {
  const trainer = finishGenerations(777, 5);
  const champion = trainer.champion;
  const fitnesses = [];
  const scores = [];
  for (const seed of champion.evaluationSeeds) {
    const net = NeuralNetwork.fromGenes(trainer.netSizes, Float64Array.from(champion.genes));
    const env = new FlappyEnv({ lookahead: 1 });
    env.reset(seed);
    let fitness = 0;
    for (let tick = 0; tick < 500; tick++) {
      const result = env.step(net.forward(env.getInputs()));
      fitness += result.reward;
      if (result.done) break;
    }
    fitnesses.push(fitness);
    scores.push(env.getScore());
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.equal(champion.fitness, mean(fitnesses));
  assert.equal(champion.score, mean(scores));
});

test('Brain round-trip hợp lệ và phát hiện chỉnh sửa', () => {
  const trainer = finishGenerations(9876, 2);
  const settings = {
    gameKey: 'flappy', environmentVersion: '1.0.0', hiddenNodes: 5,
    lookahead: 1, searchDepth: 1, strategies: [],
  };
  const brain = createBrain({
    game: 'flappy', environmentVersion: '1.0.0',
    architecture: { ...archOf(settings), networkSizes: trainer.netSizes },
    champion: trainer.champion,
    training: { experimentSeed: 9876, population: 18, mutationRate: 0.1 },
  });
  const sameBrain = createBrain({
    game: 'flappy', environmentVersion: '1.0.0',
    architecture: { ...archOf(settings), networkSizes: trainer.netSizes },
    champion: trainer.champion,
    training: { experimentSeed: 9876, population: 18, mutationRate: 0.1 },
  });
  assert.equal(sameBrain.hash, brain.hash);
  assert.equal(validateBrain(JSON.parse(JSON.stringify(brain))).hash, brain.hash);
  const tampered = JSON.parse(JSON.stringify(brain));
  tampered.genome[0] += 1;
  assert.throws(() => validateBrain(tampered), /thay đổi|bị hỏng/);
});

test('Server evaluator dùng cùng hidden seeds cho kết quả ổn định', () => {
  const trainer = finishGenerations(2026, 2);
  const architecture = {
    ...archOf({ gameKey: 'flappy', environmentVersion: '1.0.0', hiddenNodes: 5, lookahead: 1 }),
    networkSizes: trainer.netSizes,
    parameterCount: NeuralNetwork.geneCount(trainer.netSizes),
  };
  const brain = createBrain({
    game: 'flappy', environmentVersion: '1.0.0', architecture,
    champion: trainer.champion,
    training: { experimentSeed: 2026, population: 18, mutationRate: 0.1 },
  });
  assert.deepEqual(evaluateBrain(brain, [11, 22, 33], 500), evaluateBrain(brain, [11, 22, 33], 500));
});

test('Compatibility chỉ chứa option thuộc đúng game', () => {
  const arch = archOf({
    gameKey: 'flappy', hiddenNodes: 8, lookahead: 2,
    searchDepth: 3, strategies: ['corner'], evalDepth: 2,
  });
  assert.equal(arch.lookahead, 2);
  assert.equal('searchDepth' in arch, false);
  assert.equal('strategies' in arch, false);
  assert.equal('evalDepth' in arch, false);
  assert.match(archId(arch), /^v2-[0-9a-f]{8}$/);
});

test('Lịch sử lưu metadata đúng champion, không ghép với snapshot khác', () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const arch = archOf({ gameKey: 'snake', hiddenNodes: 4, environmentVersion: '1.0.0' });
  const champion = { genes: [1], score: 7, fitness: 123, generation: 9, evaluationSeeds: [42] };
  saveRun('snake', {
    arch, popSize: 20, mutationRate: 0.1, generation: 10,
    bestScore: 999, bestFitness: 999, champion,
    ranked: [{ genes: [2], score: 1, fitness: 2 }], experimentSeed: 88,
  });
  const saved = loadHistory('snake')[0];
  assert.equal(saved.bestScore, 7);
  assert.equal(saved.bestFitness, 123);
  assert.deepEqual(saved.champion, champion);
});

test('Public v1 chỉ đăng ký ba game', () => {
  assert.deepEqual(Object.keys(registry).sort(), ['2048', 'flappy', 'snake']);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

if (failures) process.exitCode = 1;
else console.log(`\n${tests.length} kiểm thử đã đạt.`);
