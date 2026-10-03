/** Cấu hình chuẩn dùng chung ở UI, storage và lúc tạo một phiên chạy. */
import { registry } from './environments/registry.js';

import { ENV_VERSION, ALGORITHM_VERSION } from './versions.js';
export { SCHEMA_VERSION, ENV_VERSION, ALGORITHM_VERSION } from './versions.js';
export const EPISODE_LIMITS = { flappy: 20000, snake: 8000, '2048': 4000, hillclimb: 20000 };
const FEATURES = ['corner', 'mono', 'occupancy', 'merges'];

function number(value, fallback, name, min, max, integer = false) {
  const n = value === undefined ? fallback : typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${name} phải ${integer ? 'là số nguyên' : 'là số'} trong khoảng ${min}–${max}.`);
  }
  return n;
}

export function normalizeSettings(raw = {}) {
  const gameKey = raw.gameKey;
  if (!Object.prototype.hasOwnProperty.call(registry, gameKey)) throw new Error('Game không được hỗ trợ.');
  if (raw.resumeSource !== undefined && !['latest', 'champion'].includes(raw.resumeSource)) {
    throw new Error('Nguồn học tiếp không hợp lệ.');
  }
  const optional = (value, name, min, max, integer = false) =>
    value == null || value === '' ? null : number(value, null, name, min, max, integer);
  let strategies = [];
  if (gameKey === '2048') {
    if (raw.strategies !== undefined && (!Array.isArray(raw.strategies)
      || raw.strategies.some(k => !FEATURES.includes(k)))) throw new Error('Mẹo 2048 không hợp lệ.');
    strategies = [...new Set(raw.strategies || [])].sort();
  }
  return {
    gameKey,
    popSize: number(raw.popSize, 100, 'Quần thể', 10, 500, true),
    hiddenNodes: number(raw.hiddenNodes, 8, 'Node lớp ẩn', 2, 32, true),
    mutationRate: number(raw.mutationRate, 0.1, 'Tỉ lệ đột biến', 0.01, 0.5),
    lookahead: gameKey === 'flappy' ? number(raw.lookahead, 1, 'Số ống nhìn trước', 1, 3, true) : 1,
    searchDepth: gameKey === '2048' ? number(raw.searchDepth, 1, 'Độ sâu', 1, 3, true) : 1,
    strategies,
    seedsPerGen: number(raw.seedsPerGen, 1, 'Số map/thế hệ', 1, 3, true),
    episodeLimit: number(raw.episodeLimit, EPISODE_LIMITS[gameKey], 'Giới hạn tick', 1, 200000, true),
    targetScore: optional(raw.targetScore, 'Điểm mục tiêu', Number.MIN_VALUE, Number.MAX_SAFE_INTEGER),
    maxGenerations: optional(raw.maxGenerations, 'Giới hạn thế hệ', 1, 10000, true),
    maxMinutes: optional(raw.maxMinutes, 'Giới hạn phút', 0.1, 1440),
    resume: raw.resume === true,
    resumeId: typeof raw.resumeId === 'string' ? raw.resumeId : null,
    resumeSource: raw.resumeSource === 'champion' ? 'champion' : 'latest',
  };
}

export function archOf(raw) {
  const s = normalizeSettings(raw);
  return { gameKey: s.gameKey, hiddenNodes: s.hiddenNodes, lookahead: s.lookahead,
    searchDepth: s.searchDepth, strategies: s.strategies, seedsPerGen: s.seedsPerGen,
    episodeLimit: s.episodeLimit, envVersion: ENV_VERSION, algorithmVersion: ALGORITHM_VERSION };
}

export function archId(arch) {
  return [arch.gameKey, arch.hiddenNodes, arch.lookahead, arch.searchDepth,
    arch.strategies.join('+') || '-', arch.seedsPerGen, arch.episodeLimit,
    arch.envVersion, arch.algorithmVersion].join('|');
}

export function resolveEnv(raw) {
  const s = normalizeSettings(raw);
  const entry = registry[s.gameKey];
  const envOptions = s.gameKey === 'flappy' ? { lookahead: s.lookahead }
    : s.gameKey === '2048' ? { searchDepth: s.searchDepth, strategies: s.strategies } : {};
  return { entry, envOptions, envConfig: entry.configFor ? entry.configFor(envOptions) : entry.config };
}

export function netSizesFor(raw) {
  const s = normalizeSettings(raw);
  const { envConfig } = resolveEnv(s);
  return [envConfig.inputs, s.hiddenNodes, envConfig.outputs];
}
