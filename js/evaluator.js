import { NeuralNetwork } from './nn.js';
import { registry } from './environments/registry.js';
import { archOf, archId } from './storage.js';

export function verifyBrainCompatibility(brain) {
  const entry = registry[brain.game];
  if (!entry) throw new Error('Game không được hỗ trợ.');
  const arch = brain.architecture;
  const opts = {
    lookahead: arch.lookahead,
    searchDepth: arch.searchDepth,
    strategies: arch.strategies || [],
  };
  const config = entry.configFor ? entry.configFor(opts) : entry.config;
  const expectedSizes = [config.inputs, arch.hiddenNodes, config.outputs];
  const expectedArchitecture = archOf({
    gameKey: brain.game,
    environmentVersion: brain.environmentVersion,
    hiddenNodes: arch.hiddenNodes,
    lookahead: arch.lookahead,
    searchDepth: arch.searchDepth,
    strategies: arch.strategies,
  });
  const { networkSizes: _sizes, parameterCount: _count, ...portableArchitecture } = arch;
  if (brain.environmentVersion !== (config.version || '1.0.0')
    || brain.architecture.networkSizes.join(',') !== expectedSizes.join(',')
    || archId(expectedArchitecture) !== archId(portableArchitecture)) {
    throw new Error('Brain không tương thích với environment hiện tại.');
  }
  return { entry, config, opts, sizes: expectedSizes };
}

export function evaluateBrain(brain, seeds, maxSteps = 30000) {
  const { entry, opts, sizes } = verifyBrainCompatibility(brain);
  const scores = [];
  const fitnesses = [];
  for (const seed of seeds) {
    const env = entry.create(opts);
    const net = NeuralNetwork.fromGenes(sizes, brain.genome);
    if (typeof env.attachNetwork === 'function') env.attachNetwork(net);
    env.reset(seed);
    let fitness = 0;
    for (let step = 0; step < maxSteps; step++) {
      const result = env.step(net.forward(env.getInputs()));
      fitness += result.reward;
      if (result.done) break;
    }
    scores.push(Number(env.getScore?.() || 0));
    fitnesses.push(fitness);
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    metric: 'mean-score', mean, median,
    min: sorted[0], max: sorted[sorted.length - 1], runs: scores.length,
    meanFitness: fitnesses.reduce((sum, value) => sum + value, 0) / fitnesses.length,
  };
}
