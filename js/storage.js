/** Lịch sử v2: champion có bằng chứng riêng, snapshot mới nhất dùng gây giống.
 * Key cũ và backup migration không bị xóa/cắt theo giới hạn 10 cấu hình.
 */
import { NeuralNetwork } from './nn.js';
import { SCHEMA_VERSION, ENV_VERSION, ALGORITHM_VERSION, normalizeSettings, netSizesFor,
  archOf, archId } from './settings.js';
export { archOf, archId } from './settings.js';

const PREFIX = 'neuroai:history:v2:';
const OLD_PREFIX = 'neuroai:history:';
const LEGACY_PREFIX = 'neuroai:lastRun:';
const BACKUP_PREFIX = 'neuroai:migration:v2:';
const MAX_ENTRIES = 10;
const copy = value => JSON.parse(JSON.stringify(value));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const positiveInt = n => Number.isSafeInteger(n) && n >= 1;
const failure = error => ({ ok: false, error: error.message || String(error) });

function checkEpisode(e, limit) {
  if (!e || !Number.isInteger(e.seed) || e.seed < 0 || e.seed > 0x7fffffff
    || !finite(e.fitness) || !finite(e.score) || e.score < 0
    || !positiveInt(e.ticks) || e.ticks > limit || typeof e.done !== 'boolean'
    || typeof e.truncated !== 'boolean' || e.done === e.truncated
    || (e.truncated && e.ticks !== limit)) throw new Error('Metric episode không hợp lệ.');
}

function checkSnapshot(snapshot, settings) {
  if (!snapshot || !positiveInt(snapshot.generation) || !finite(snapshot.evaluatedAt)
    || !Array.isArray(snapshot.ranked) || !snapshot.ranked.length || snapshot.ranked.length > 30
    || typeof snapshot.verified !== 'boolean' || ![1, ENV_VERSION].includes(snapshot.envVersion)
    || snapshot.algorithmVersion !== ALGORITHM_VERSION
    || snapshot.verified !== (snapshot.envVersion === ENV_VERSION)) throw new Error('Snapshot không hợp lệ hoặc khác phiên bản.');
  const sizes = netSizesFor(settings);
  for (const row of snapshot.ranked) {
    NeuralNetwork.validateGenes(sizes, row.genes);
    if (!finite(row.fitness) || !(row.score === null || (finite(row.score) && row.score >= 0))) {
      throw new Error('Metric genome không hợp lệ.');
    }
    if (snapshot.verified) {
      if (!finite(row.score) || !finite(row.meanScore)) throw new Error('Thiếu score tổng hợp.');
      if (!Array.isArray(row.episodes) || row.episodes.length !== settings.seedsPerGen) throw new Error('Thiếu metric từng seed.');
      row.episodes.forEach(e => checkEpisode(e, settings.episodeLimit));
      const meanFitness = row.episodes.reduce((s,e) => s + e.fitness, 0) / row.episodes.length;
      const meanScore = row.episodes.reduce((s,e) => s + e.score, 0) / row.episodes.length;
      if (Math.abs(meanFitness - row.fitness) > 1e-8 || Math.abs(meanScore - row.meanScore) > 1e-8
        || row.score !== Math.max(...row.episodes.map(e => e.score))) throw new Error('Metric tổng hợp không khớp episode.');
    }
  }
  if (snapshot.ranked.some((row,i,a) => i > 0 && row.fitness > a[i-1].fitness)) throw new Error('Snapshot chưa xếp hạng theo fitness.');
}

function checkChampion(champion, settings) {
  if (champion == null) return;
  NeuralNetwork.validateGenes(netSizesFor(settings), champion.genes);
  checkEpisode(champion, settings.episodeLimit);
  if (champion.verified !== true || !positiveInt(champion.generation)
    || champion.envVersion !== ENV_VERSION || champion.algorithmVersion !== ALGORITHM_VERSION) {
    throw new Error('Champion chưa được kiểm chứng hoặc khác phiên bản.');
  }
}

export function validateEntry(entry, gameKey) {
  if (!entry || entry.schemaVersion !== SCHEMA_VERSION || entry.envVersion !== ENV_VERSION
    || entry.algorithmVersion !== ALGORITHM_VERSION || entry.gameKey !== gameKey) throw new Error('Lịch sử khác game hoặc phiên bản.');
  const settings = normalizeSettings(entry.settings);
  if (settings.gameKey !== gameKey || entry.id !== archId(archOf(settings))
    || JSON.stringify(entry.arch) !== JSON.stringify(archOf(settings))) throw new Error('Kiến trúc lịch sử không khớp cấu hình.');
  if (!finite(entry.savedAt) || !Array.isArray(entry.legacyRecords)) throw new Error('Metadata lịch sử không hợp lệ.');
  for (const record of entry.legacyRecords) {
    if (!record || record.unverified !== true || !finite(record.savedAt)
      || !positiveInt(record.generation) || !(record.bestScore === null || finite(record.bestScore))
      || !(record.bestFitness === null || finite(record.bestFitness))) throw new Error('Record legacy không hợp lệ.');
  }
  checkSnapshot(entry.latestPopulation, settings);
  checkChampion(entry.champion, settings);
  return entry;
}

const betterChampion = (a,b) => !!a && (!b || a.score > b.score || (a.score === b.score && a.fitness > b.fitness));
function mergeEntries(a,b) {
  if (!a) return b;
  const latest = b.latestPopulation.evaluatedAt >= a.latestPopulation.evaluatedAt ? b : a;
  const legacy = [...a.legacyRecords, ...b.legacyRecords];
  return { ...latest, champion: betterChampion(b.champion,a.champion) ? b.champion : a.champion,
    legacyRecords: legacy.filter((r,i) => legacy.findIndex(t => JSON.stringify(t) === JSON.stringify(r)) === i) };
}

function legacyEntry(gameKey, old) {
  const fields = old.arch || old;
  const settings = normalizeSettings({ ...fields, gameKey, popSize: old.popSize ?? 100,
    mutationRate: old.mutationRate ?? 0.1 });
  const savedAt = finite(old.savedAt) ? old.savedAt : 0;
  const ranked = old.ranked?.map(row => ({ genes: row.genes, fitness: row.fitness,
    score: finite(row.score) ? row.score : null }));
  // Bản cũ persist sau evolve: nhãn lưu là gen mới, nhưng gen là của gen trước.
  if (!positiveInt(old.generation)) throw new Error('Thế hệ lịch sử cũ không hợp lệ.');
  const generation = Math.max(1, old.generation - 1);
  const entry = { schemaVersion: SCHEMA_VERSION, envVersion: ENV_VERSION,
    algorithmVersion: ALGORITHM_VERSION, gameKey, id: archId(archOf(settings)),
    arch: archOf(settings), settings, savedAt, champion: null,
    latestPopulation: { generation, ranked, evaluatedAt: savedAt, verified: false,
      envVersion: 1, algorithmVersion: ALGORITHM_VERSION },
    legacyRecords: [{ bestScore: finite(old.bestScore) ? old.bestScore : null,
      bestFitness: finite(old.bestFitness) ? old.bestFitness : null,
      generation: old.generation, savedAt, unverified: true }] };
  return validateEntry(entry,gameKey);
}

function legacySources(gameKey, backup) {
  const sources = [], warnings = [];
  for (const [kind,raw] of [['history',backup.historyRaw], ['lastRun',backup.lastRunRaw]]) {
    if (raw == null) continue;
    try {
      const parsed = JSON.parse(raw);
      const list = kind === 'history' ? parsed : [parsed];
      if (!Array.isArray(list)) throw new Error('Lịch sử cũ không phải danh sách.');
      list.forEach((old,index) => {
        try { sources.push({ sourceId: `${kind}:${index}`, entry: legacyEntry(gameKey,old) }); }
        catch (error) { warnings.push(`${kind} #${index + 1}: ${error.message}`); }
      });
    } catch (error) { warnings.push(`${kind}: ${error.message}`); }
  }
  return { sources, warnings };
}

function write(gameKey, entries) {
  entries.forEach(e => validateEntry(e,gameKey));
  localStorage.setItem(PREFIX + gameKey, JSON.stringify({schemaVersion:SCHEMA_VERSION,gameKey,entries}));
}

export function readHistory(gameKey) {
  try {
    normalizeSettings({gameKey});
    const raw = localStorage.getItem(PREFIX + gameKey);
    if (raw != null) {
      const doc = JSON.parse(raw);
      if (doc.schemaVersion !== SCHEMA_VERSION || doc.gameKey !== gameKey || !Array.isArray(doc.entries)
        || doc.entries.length > MAX_ENTRIES) throw new Error('Định dạng lịch sử không được hỗ trợ.');
      doc.entries.forEach(e => validateEntry(e,gameKey));
      if (new Set(doc.entries.map(e => e.id)).size !== doc.entries.length) throw new Error('Lịch sử chứa ID trùng.');
      return { ok:true, entries:doc.entries, warnings:[], backupAvailable:localStorage.getItem(BACKUP_PREFIX+gameKey)!=null };
    }
    const historyRaw = localStorage.getItem(OLD_PREFIX + gameKey);
    const lastRunRaw = localStorage.getItem(LEGACY_PREFIX + gameKey);
    if (historyRaw == null && lastRunRaw == null) return {ok:true,entries:[],warnings:[],backupAvailable:false};
    const backupRaw = localStorage.getItem(BACKUP_PREFIX + gameKey);
    const backup = backupRaw ? JSON.parse(backupRaw) : { gameKey, historyRaw, lastRunRaw, createdAt:Date.now() };
    // Ghi backup TRƯỚC v2. Nếu quota fail, giữ nguyên mọi key cũ, không báo đã migrate.
    if (!backupRaw) localStorage.setItem(BACKUP_PREFIX+gameKey,JSON.stringify(backup));
    const {sources,warnings} = legacySources(gameKey,backup);
    if (!sources.length) throw new Error('Không có snapshot cũ hợp lệ. Xuất bản gốc để kiểm tra/phục hồi.');
    const merged = new Map();
    sources.forEach(({entry}) => merged.set(entry.id,mergeEntries(merged.get(entry.id),entry)));
    const entries = [...merged.values()].sort((a,b)=>b.savedAt-a.savedAt).slice(0,MAX_ENTRIES);
    write(gameKey,entries);
    return {ok:true,entries,warnings,backupAvailable:true};
  } catch (error) { return {...failure(error),entries:[],warnings:[],backupAvailable:true}; }
}

export function loadHistory(gameKey) { return readHistory(gameKey).entries; }
export function loadHistoryEntry(gameKey,id) {
  const result = readHistory(gameKey);
  if (!result.ok) throw new Error(result.error);
  return result.entries.find(e=>e.id===id) || null;
}

/** Lưu latest dù thế hệ mới kém hơn; chỉ champion thay khi thật sự phá record. */
export function saveRun(gameKey, {settings, latestPopulation, champion}) {
  try {
    const s = normalizeSettings({...settings,gameKey,resume:false,resumeId:null});
    const result = readHistory(gameKey);
    if (!result.ok) throw new Error(result.error);
    const entry = {schemaVersion:SCHEMA_VERSION,envVersion:ENV_VERSION,algorithmVersion:ALGORITHM_VERSION,
      gameKey,id:archId(archOf(s)),arch:archOf(s),settings:s,savedAt:Date.now(),
      latestPopulation:copy(latestPopulation),champion:champion ? copy(champion) : null,legacyRecords:[]};
    validateEntry(entry,gameKey);
    const previous = result.entries.find(e=>e.id===entry.id);
    const merged = mergeEntries(previous,entry);
    const entries = result.entries.filter(e=>e.id!==entry.id);
    entries.push(merged);
    entries.sort((a,b)=>b.savedAt-a.savedAt);
    write(gameKey,entries.slice(0,MAX_ENTRIES));
    return {ok:true,entry:merged};
  } catch(error) { return failure(error); }
}

export function prepareResume(settings) {
  const s = normalizeSettings(settings);
  if (!s.resume || !s.resumeId) throw new Error('Chọn một mục lịch sử để học tiếp.');
  const entry = loadHistoryEntry(s.gameKey,s.resumeId);
  if (!entry) throw new Error('Mục lịch sử không còn tồn tại. Chọn lại mục khác.');
  validateEntry(entry,s.gameKey);
  if (entry.id !== archId(archOf(s))) throw new Error('Thông số không khớp mục lịch sử. Chọn lại cấu hình đã lưu.');
  if (s.resumeSource === 'champion' && !entry.champion) throw new Error('Mục này chưa có champion được kiểm chứng. Chọn snapshot mới nhất.');
  const ranked = s.resumeSource === 'champion'
    ? [{genes:entry.champion.genes,fitness:entry.champion.fitness,score:entry.champion.score}]
    : entry.latestPopulation.ranked;
  const generation = s.resumeSource === 'champion' ? entry.champion.generation : entry.latestPopulation.generation;
  return { seedRanked:copy(ranked), startGeneration:generation+1,
    champion:entry.champion ? copy(entry.champion) : null,
    warning:entry.latestPopulation.verified ? null : 'Snapshot cũ: sẽ đánh giá lại theo luật/giới hạn hiện tại. Record cũ chưa kiểm chứng.' };
}

export function deleteHistoryEntry(gameKey,id) {
  try {
    const result=readHistory(gameKey);
    if(!result.ok) throw new Error(result.error);
    write(gameKey,result.entries.filter(e=>e.id!==id));
    return {ok:true};
  } catch(error) {return failure(error);}
}
export function clearHistory(gameKey) {
  try { write(gameKey,[]); return {ok:true}; } catch(error) {return failure(error);}
}

/** Xuất cả dữ liệu hỏng và các nguồn trùng ID, không phụ thuộc validation. */
export function exportHistoryBackup(gameKey) {
  return {gameKey, exportedAt:Date.now(), historyV2Raw:localStorage.getItem(PREFIX+gameKey),
    migrationRaw:localStorage.getItem(BACKUP_PREFIX+gameKey),
    historyRaw:localStorage.getItem(OLD_PREFIX+gameKey),lastRunRaw:localStorage.getItem(LEGACY_PREFIX+gameKey)};
}
export function listMigrationSources(gameKey) {
  const raw=localStorage.getItem(BACKUP_PREFIX+gameKey);
  if(!raw) return [];
  return legacySources(gameKey,JSON.parse(raw)).sources;
}
export function restoreMigrationSource(gameKey,sourceId) {
  try {
    const source=listMigrationSources(gameKey).find(s=>s.sourceId===sourceId);
    if(!source) throw new Error('Nguồn backup không tồn tại hoặc không hợp lệ.');
    const result=readHistory(gameKey);
    if(!result.ok) throw new Error(result.error);
    const old=result.entries.find(e=>e.id===source.entry.id);
    // Người dùng chủ động chọn nguồn để phục hồi latest, giữ champion hiện có.
    const restored={...source.entry,savedAt:Date.now(),champion:old?.champion||null,
      legacyRecords:mergeEntries(old,source.entry).legacyRecords};
    const entries=result.entries.filter(e=>e.id!==restored.id);
    entries.unshift(restored);
    write(gameKey,entries.slice(0,MAX_ENTRIES));
    return {ok:true};
  } catch(error) {return failure(error);}
}
