import assert from 'node:assert/strict';
import { normalizeSettings, archOf, archId, netSizesFor, resolveEnv, ENV_VERSION, ALGORITHM_VERSION } from '../js/settings.js';
import { NeuralNetwork } from '../js/nn.js';
import { Trainer } from '../js/ga.js';
import { ComparisonRun } from '../js/compare.js';
import { RunSession } from '../js/session.js';
import { readHistory, saveRun, prepareResume, loadHistoryEntry, deleteHistoryEntry,
  listMigrationSources, restoreMigrationSource, exportHistoryBackup, validateEntry } from '../js/storage.js';
import '../js/ui.js'; // Parse UI và các import mà không cần giả lập trình duyệt.

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const clone = value => JSON.parse(JSON.stringify(value));
const s = (gameKey='snake', extra={}) => normalizeSettings({gameKey,popSize:10,hiddenNodes:4,episodeLimit:4,...extra});
const genes = settings => Array(NeuralNetwork.geneCount(netSizesFor(settings))).fill(0.2);
const episode = (score=4,fitness=10,extra={}) => ({seed:123,score,fitness,ticks:4,done:false,truncated:true,...extra});
const snapshot = (settings,generation=1,score=4,fitness=10) => ({generation,evaluatedAt:Date.now(),verified:true,
  envVersion:ENV_VERSION,algorithmVersion:ALGORITHM_VERSION,
  ranked:[{genes:genes(settings),fitness,score,meanScore:score,
    episodes:Array.from({length:settings.seedsPerGen},()=>episode(score,fitness))}]});
const champion = (settings,score=4,fitness=10,generation=1) => ({...episode(score,fitness),genes:genes(settings),generation,
  verified:true,envVersion:ENV_VERSION,algorithmVersion:ALGORITHM_VERSION});
const OLD = 'neuroai:history:snake', NEW = 'neuroai:history:v2:snake', BACKUP = 'neuroai:migration:v2:snake';
let memory, failWrite, failRead;
function resetStorage() {
  memory = new Map(); failWrite = null; failRead = false;
  globalThis.localStorage = {
    getItem(k) {if(failRead) throw new Error('Read denied'); return memory.get(k) ?? null;},
    setItem(k,v) {if(failWrite === '*' || failWrite === k) throw new Error('Quota exceeded'); memory.set(k,v);},
    removeItem(k) {memory.delete(k);},
  };
}
function oldRecord(extra={}) {
  return {id:'old-id',arch:{hiddenNodes:4,lookahead:1,searchDepth:1,strategies:[],seedsPerGen:1,evalDepth:1,startLevel:1},
    popSize:10,mutationRate:0.1,generation:8,savedAt:1000,bestScore:99,bestFitness:1000,
    ranked:[{genes:genes(s()),fitness:10,score:4}],...extra};
}
test('normalize không mang option ẩn sang game khác', () => {
  const clean=s(); const changed=s('snake',{lookahead:3,searchDepth:3,strategies:['garbage'],evalDepth:2});
  assert.deepEqual(archOf(clean),archOf(changed));
  assert.equal(archId(archOf(clean)),archId(archOf(changed)));
  assert.deepEqual(resolveEnv(changed).envOptions,{});
});
test('settings reject NaN/Infinity, vượt trần, số lẻ và lựa chọn không hợp lệ', () => {
  for (const field of ['popSize','hiddenNodes','mutationRate','episodeLimit','seedsPerGen']) {
    for (const value of [NaN,Infinity,'abc','',false,null]) assert.throws(()=>s('snake',{[field]:value}));
  }
  for (const bad of [{popSize:501},{popSize:10.5},{hiddenNodes:33},{hiddenNodes:1},{mutationRate:0},
    {seedsPerGen:4},{episodeLimit:200001},{maxGenerations:1.5},{maxMinutes:0},{targetScore:0}]) assert.throws(()=>s('snake',bad));
  assert.throws(()=>s('xiangqi'));
  assert.throws(()=>s('2048',{strategies:['x']}));
  assert.throws(()=>s('snake',{resumeSource:'bad'}));
  assert.deepEqual(s('2048',{strategies:['mono','corner','mono']}).strategies,['corner','mono']);
});
test('architecture phân biệt luật/giới hạn, bỏ target và ngân sách phiên', () => {
  assert.notEqual(archId(archOf(s())),archId(archOf(s('snake',{episodeLimit:5}))));
  assert.equal(archId(archOf(s())),archId(archOf(s('snake',{maxMinutes:1,maxGenerations:2,targetScore:30}))));
});
test('NN reject genome ngắn/dài/không hữu hạn trước nạp', () => {
  const sizes=netSizesFor(s()); const g=genes(s());
  for(const bad of [g.slice(1),[...g,0],g.map((x,i)=>i?x:NaN),g.map((x,i)=>i?x:'2')]) {
    assert.throws(()=>NeuralNetwork.fromGenes(sizes,bad));
  }
  const net=NeuralNetwork.fromGenes(sizes,g); g[0]=3; assert.equal(net.getGenes()[0],0.2);
});

test('champion có thể khác top fitness; metric nhiều seed không lấy seed cuối', () => {
  let created=0;
  const trainer=new Trainer({envFactory:()=> {
    const index=created++ % 10;
    return {round:-1,reset(seed){this.round++;this.seed=seed;},getInputs(){return [0];},
      step(){return {reward:index===0?100:5,done:true};},
      getScore(){return index===1?(this.round===0?50:2):1;}};
  },envConfig:{inputs:1,outputs:1},popSize:10,hiddenNodes:4,mutationRate:0.1,seedsPerGen:2,maxStepsPerGen:4});
  const topGenes=Array.from(trainer.population[0].net.getGenes());
  const champGenes=Array.from(trainer.population[1].net.getGenes());
  assert.equal(trainer.stepAll(),0); assert.equal(trainer.onGenerationEnd(),false);
  const firstSeed=trainer.population[1].episodes[0].seed;
  assert.equal(trainer.stepAll(),0); assert.equal(trainer.onGenerationEnd(),true);
  assert.equal(trainer.latestPopulation.generation,1); assert.equal(trainer.generation,2);
  assert.deepEqual(trainer.lastRanked[0].genes,topGenes);
  assert.deepEqual(trainer.champion.genes,champGenes);
  assert.equal(trainer.champion.score,50); assert.equal(trainer.champion.fitness,5);
  assert.equal(trainer.champion.seed,firstSeed);
  assert.equal(trainer.lastRanked[1].meanScore,26); assert.equal(trainer.lastRanked[1].score,50);
  assert.equal(trainer.history[0].score,26); assert.equal(trainer.history[0].recordScore,50);
  const original=clone(trainer.latestPopulation); trainer.population[0].net.setGenes(Array(topGenes.length).fill(9));
  assert.deepEqual(trainer.latestPopulation,original);
});
test('done/truncated phân biệt kể cả đúng tick giới hạn', () => {
  for(const natural of [false,true]) {
    const t=new Trainer({envFactory:()=>({reset(){},getInputs(){return [0];},getScore(){return 1;},step(){return {reward:1,done:natural};}}),
      envConfig:{inputs:1,outputs:1},popSize:10,hiddenNodes:4,mutationRate:0.1,maxStepsPerGen:1});
    assert.equal(t.stepAll(),0); t.onGenerationEnd();
    assert.equal(t.lastRanked[0].episodes[0].truncated,!natural);
    assert.equal(t.lastRanked[0].episodes[0].done,natural);
  }
});
test('Trainer không chốt episode chưa xong và không nạp genome sai', () => {
  const {entry,envConfig,envOptions}=resolveEnv(s());
  const opts={envFactory:entry.create,envConfig,envOptions,popSize:10,hiddenNodes:4,mutationRate:0.1,maxStepsPerGen:4};
  assert.throws(()=>new Trainer({...opts,seedRanked:[{genes:[1],fitness:1}]}));
  const trainer=new Trainer(opts); assert.throws(()=>trainer.onGenerationEnd());
});

test('save latest khi kém record; champion không bị ghép với genome mới', () => {
  resetStorage(); const settings=s(); const first=champion(settings,50,10);
  assert(saveRun('snake',{settings,latestPopulation:snapshot(settings),champion:first}).ok);
  const latest=snapshot(settings,2,1,2); latest.evaluatedAt += 100;
  latest.ranked[0].genes.fill(0.9);
  assert(saveRun('snake',{settings,latestPopulation:latest,champion:champion(settings,1,2,2)}).ok);
  const saved=readHistory('snake').entries[0];
  assert.equal(saved.latestPopulation.generation,2); assert.equal(saved.champion.score,50);
  assert.deepEqual(saved.champion.genes,first.genes); assert.equal(saved.latestPopulation.ranked[0].genes[0],0.9);
});
test('resume latest gen N sinh N+1; champion là nguồn tường minh', () => {
  const settings=s(); const entry=readHistory('snake').entries[0];
  const latest=prepareResume({...settings,resume:true,resumeId:entry.id});
  assert.equal(latest.startGeneration,3); assert.equal(latest.seedRanked[0].genes[0],0.9);
  const champ=prepareResume({...settings,resume:true,resumeId:entry.id,resumeSource:'champion'});
  assert.equal(champ.startGeneration,2); assert.equal(champ.seedRanked[0].genes[0],0.2);
  assert.throws(()=>prepareResume({...settings,resume:true,resumeId:entry.id,episodeLimit:5}));
  assert.throws(()=>prepareResume({...settings,resume:true,resumeId:'missing'}));
});
test('save lỗi quota báo fail và giữ dữ liệu đã ghi', () => {
  const before=memory.get(NEW); failWrite=NEW;
  assert.equal(saveRun('snake',{settings:s(),latestPopulation:snapshot(s(),3),champion:champion(s())}).ok,false);
  assert.equal(memory.get(NEW),before); failWrite=null;
});
test('JSON hỏng/phiên bản lạ không bị save overwrite hoặc resume fallback', () => {
  resetStorage(); memory.set(NEW,'{broken'); const original=memory.get(NEW);
  assert.equal(readHistory('snake').ok,false);
  assert.equal(saveRun('snake',{settings:s(),latestPopulation:snapshot(s()),champion:champion(s())}).ok,false);
  assert.equal(memory.get(NEW),original);
  assert.throws(()=>prepareResume({...s(),resume:true,resumeId:'missing'}));
  memory.set(NEW,JSON.stringify({schemaVersion:999,gameKey:'snake',entries:[]}));
  assert.equal(readHistory('snake').ok,false);
});
test('validate reject thiếu metric, genome, game, version, seed và score không khớp', () => {
  resetStorage(); saveRun('snake',{settings:s(),latestPopulation:snapshot(s()),champion:champion(s())});
  const entry=readHistory('snake').entries[0];
  const mutations=[e=>e.latestPopulation.ranked[0].genes.pop(),e=>e.champion.genes[0]=null,
    e=>e.gameKey='2048',e=>e.envVersion=999,e=>e.champion.seed=-1,
    e=>e.latestPopulation.ranked[0].meanScore=null,e=>e.latestPopulation.ranked[0].meanScore=999,
    e=>e.latestPopulation.ranked[0].episodes[0].fitness=999,e=>e.champion.truncated=false];
  for(const mutate of mutations) {const bad=clone(entry);mutate(bad);assert.throws(()=>validateEntry(bad,'snake'));}
});
test('migration collision: latest theo timestamp, tất cả record legacy chưa kiểm chứng', () => {
  resetStorage(); const a=oldRecord(); const b=oldRecord({savedAt:2000,generation:10,bestScore:2});
  b.arch.lookahead=3; b.ranked[0].genes.fill(0.7);
  memory.set(OLD,JSON.stringify([a,b])); const original=memory.get(OLD);
  const result=readHistory('snake'); assert(result.ok); assert.equal(result.entries.length,1);
  const entry=result.entries[0]; assert.equal(entry.champion,null);
  assert.equal(entry.latestPopulation.generation,9); assert.equal(entry.latestPopulation.ranked[0].genes[0],0.7);
  assert.equal(entry.legacyRecords.length,2); assert.equal(entry.latestPopulation.verified,false);
  assert.equal(memory.get(OLD),original); assert.equal(listMigrationSources('snake').length,2);
  const backup=memory.get(BACKUP); assert.equal(JSON.parse(backup).historyRaw,original);
  const first=memory.get(NEW); readHistory('snake'); assert.equal(memory.get(NEW),first); assert.equal(memory.get(BACKUP),backup);
  const resume=prepareResume({...entry.settings,resume:true,resumeId:entry.id});
  assert.equal(resume.startGeneration,10); assert(resume.warning);
  assert.throws(()=>prepareResume({...entry.settings,resume:true,resumeId:entry.id,resumeSource:'champion'}));
  assert(restoreMigrationSource('snake','history:0').ok);
  assert.equal(readHistory('snake').entries[0].latestPopulation.generation,7);
  assert.equal(listMigrationSources('snake').length,2);
  assert.equal(exportHistoryBackup('snake').historyRaw,original);
});
test('backup giữ hơn 10 cấu hình/nguồn dù history active có giới hạn', () => {
  resetStorage(); const old=Array.from({length:15},(_,i)=>oldRecord({savedAt:i+1,arch:{...oldRecord().arch,hiddenNodes:i+2},
    ranked:[{genes:genes(s('snake',{hiddenNodes:i+2})),fitness:1,score:1}]}));
  memory.set(OLD,JSON.stringify(old)); const result=readHistory('snake');
  assert(result.ok); assert.equal(result.entries.length,10); assert.equal(listMigrationSources('snake').length,15);
});
test('migration ghi backup/v2 thất bại không xóa nguồn cũ', () => {
  for(const key of [BACKUP,NEW]) {
    resetStorage();memory.set(OLD,JSON.stringify([oldRecord()]));const before=memory.get(OLD);failWrite=key;
    assert.equal(readHistory('snake').ok,false); assert.equal(memory.get(OLD),before); assert.equal(memory.has(NEW),false);
    failWrite=null; assert(readHistory('snake').ok);
  }
});
test('định dạng lastRun migrate được và dữ liệu lỗi vẫn có trong backup', () => {
  resetStorage();memory.set('neuroai:lastRun:snake',JSON.stringify({...oldRecord(),...oldRecord().arch,popSize:null,mutationRate:null}));
  assert(readHistory('snake').ok);assert(memory.has('neuroai:lastRun:snake'));
  resetStorage();memory.set(OLD,JSON.stringify([oldRecord(),{bad:true}]));
  const result=readHistory('snake'); assert(result.ok);assert.equal(result.warnings.length,1);
  assert(JSON.parse(exportHistoryBackup('snake').migrationRaw).historyRaw.includes('bad'));
});
test('restore source giữ champion hiện tại; xóa không tự migrate lại', () => {
  const migrated=readHistory('snake').entries[0];
  const settings=migrated.settings;
  const latest=snapshot(settings);latest.ranked[0].episodes.forEach(e=>e.ticks=settings.episodeLimit);
  const champ=champion(settings);champ.ticks=settings.episodeLimit;
  assert(saveRun('snake',{settings,latestPopulation:latest,champion:champ}).ok);
  assert(restoreMigrationSource('snake','history:0').ok);
  assert.equal(readHistory('snake').entries[0].champion.score,4);
  assert(deleteHistoryEntry('snake',migrated.id).ok); assert.equal(readHistory('snake').entries.length,0);
  assert.equal(listMigrationSources('snake').length,1);
});
test('read storage bị chặn có status lỗi, không unhandled exception', () => {
  resetStorage();failRead=true;assert.equal(readHistory('snake').ok,false);
  assert.equal(saveRun('snake',{settings:s(),latestPopulation:snapshot(s()),champion:champion(s())}).ok,false);
  failRead=false;
});

test('Pause giữ thời gian, Resume không tính khoảng pause; budget gen/time và run ID', () => {
  let now=0; const session=new RunSession(()=>now); const token=session.start(s('snake',{maxMinutes:0.1,maxGenerations:3}));
  now=1000;session.pause();now=10000;assert.equal(session.activeMs(),1000);assert.equal(session.state,'paused');
  assert.equal(session.limitReason(100),null);session.resume();now=14000;assert.equal(session.activeMs(),5000);
  assert.equal(session.limitReason(3),'generations');now=15000;assert.equal(session.limitReason(0),'time');
  session.comparing=true;assert.equal(session.mode,'comparing');session.reset();
  assert.equal(session.state,'idle');assert.equal(session.comparing,false);assert.notEqual(session.runId,token);
});
test('compare cùng episode limit, đánh dấu truncated và genome độc lập', () => {
  const config=s();const g=genes(config);
  const {entry,envOptions}=resolveEnv(config);
  const compare=new ComparisonRun({netSizes:netSizesFor(config),envFactory:entry.create,envOptions,beforeGenes:g,afterGenes:g,maxTicks:1});
  compare.step();assert(compare.before.finished && compare.after.finished);
  assert.equal(compare.before.truncated,!compare.before.done);assert.equal(compare.after.ticks,1);
  assert.deepEqual(compare.before.env.getInputs(),compare.after.env.getInputs());
  g.fill(999);assert.notEqual(compare.before.net.getGenes()[0],999);
});
test('smoke 4 game / 8 config, 3 generation, save/resume/compare', () => {
  resetStorage();let count=0;
  for(const gameKey of ['flappy','snake','2048','hillclimb']) {
    const options=gameKey==='flappy'?[1,2,3].map(lookahead=>({lookahead})):
      gameKey==='2048'?[1,2,3].map(searchDepth=>({searchDepth,strategies:searchDepth===3?['corner','mono','merges','occupancy']:[]})):[{}];
    for(const extra of options) {
      const settings=s(gameKey,{...extra,seedsPerGen:2}); const {entry,envOptions,envConfig}=resolveEnv(settings);
      const trainer=new Trainer({envFactory:entry.create,envOptions,envConfig,popSize:10,hiddenNodes:4,
        mutationRate:0.1,maxStepsPerGen:4,seedsPerGen:2});
      for(let gen=0;gen<3;gen++) {do {while(trainer.stepAll()!==0) {}} while(!trainer.onGenerationEnd());}
      assert.equal(trainer.latestPopulation.generation,3);
      const result=saveRun(gameKey,{settings,latestPopulation:trainer.latestPopulation,champion:trainer.champion});
      assert(result.ok,result.error);
      const source=prepareResume({...settings,resume:true,resumeId:result.entry.id});
      const next=new Trainer({envFactory:entry.create,envOptions,envConfig,popSize:10,hiddenNodes:4,mutationRate:0.1,
        maxStepsPerGen:4,seedsPerGen:2,...source,seedChampion:source.champion});
      next.stepAll();assert.equal(next.generation,4);
      const compare=new ComparisonRun({netSizes:trainer.netSizes,envFactory:entry.create,envOptions,
        beforeGenes:trainer.gen1BestGenes,afterGenes:trainer.currentBestGenes,maxTicks:4});compare.step();count++;
    }
  }
  assert.equal(count,8);
});
console.log(`\n${passed} nhóm kiểm tra phase 1 đạt.`);
