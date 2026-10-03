/** Kiểm tra handler/rAF thật của main.js; thay rendering và game bằng fixture ngắn. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeSettings, resolveEnv } from '../js/settings.js';
import { RunSession } from '../js/session.js';

let view, clock=0, settings, trainers=[], frames=[], saved=[], failSave=false, speed=1;
class Button {
  addEventListener(_,handler) {this.handler=handler;}
  click() {this.handler();}
}
class UI {
  constructor() {
    this.el=Object.fromEntries(['btnStart','btnPause','btnStop','btnReset','btnRunCompare','btnSummaryClose','summaryOverlay'].map(k=>[k,new Button()]));
    this.summaries=[];this.compareFrames=0;this.errors=[];view=this;
    return new Proxy(this,{get:(target,key)=>key in target?target[key]:()=>{}});
  }
  readSettings() {return normalizeSettings(settings);}
  getSpeed() {return speed;}
  setRunningState(running,paused,comparing) {this.controls={running,paused,comparing};}
  updateSessionStatus(session) {this.state=session.state;this.mode=session.mode;}
  showError(message) {if(message) this.errors.push(message);}
  showStorageStatus(message) {this.storageMessage=message;}
  showSummary(summary) {this.summaries.push(summary);}
  renderCompareFrame() {this.compareFrames++;}
  updateStats(stats) {this.stats=stats;}
}
class Trainer {
  constructor(opts) {
    Object.assign(this,opts);this.generation=opts.startGeneration;this.steps=0;this.history=[];
    this.bestEver=0;this.bestEverScore=0;this.netSizes=[1,4,1];this.gen1BestGenes=[0];this.currentBestGenes=[0];
    this.milestones=[];this.lastGenerationFitnesses=[];trainers.push(this);
  }
  stepAll() {this.steps++;return 0;}
  onGenerationEnd() {
    this.latestPopulation={generation:this.generation};this.history.push({gen:this.generation});this.generation++;return true;
  }
  bestAlive() {return null;}
  aliveIndividuals() {return [];}
  topRanked() {return [];}
  currentBestFitness() {return 0;}
  currentBestScore() {return 0;}
  hasComparisonData() {return this.history.length>=2;}
}
class ComparisonRun {step(){return false;}}
class Session extends RunSession {constructor(){super(()=>clock);}}
const context=vm.createContext({requestAnimationFrame:fn=>frames.push(fn),
  document:{getElementById:()=>({width:480,height:600,getContext:()=>({clearRect(){},fillText(){}})})}});
const modules={
  './ui.js':{UI},'./ga.js':{Trainer},'./session.js':{RunSession:Session},'./compare.js':{ComparisonRun},
  './settings.js':{resolveEnv},'./analysis.js':{analyzeRun:(trainer,_,reason)=>({reason,generations:trainer.history.length})},
  './storage.js':{prepareResume:()=>{throw new Error('Mục lịch sử không hợp lệ');},saveRun:(_,value)=>{
    saved.push(value);return failSave?{ok:false,error:'quota'}:{ok:true};
  }},
};
const main=new vm.SourceTextModule(readFileSync(new URL('../js/main.js',import.meta.url),'utf8'),{context});
await main.link(specifier=>{
  const exports=modules[specifier];
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports)) this.setExport(key,value);},{context});
});
await main.evaluate();
const tick=()=>{assert(frames.length);frames.shift()();};
const start=(extra={})=>{settings={gameKey:'snake',popSize:10,hiddenNodes:4,episodeLimit:4,...extra};view.el.btnStart.click();};

start();tick();assert.equal(view.state,'running');const first=trainers.at(-1);
view.el.btnPause.click();const steps=first.steps;tick();tick();
assert.equal(first.steps,steps);assert.equal(view.state,'paused');
view.el.btnStart.click();assert.equal(trainers.at(-1),first);tick();assert.equal(first.steps,steps+1);
console.log('PASS main: Pause không tăng tick; Resume dùng đúng Trainer');

view.el.btnRunCompare.click();const oldCompare=frames.pop();
assert.equal(view.mode,'comparing');view.el.btnReset.click();
assert.equal(view.stats.generation,0);assert.equal(view.state,'idle');
start();tick();tick();view.el.btnRunCompare.click();
const newCompare=frames.pop();const before=view.compareFrames;
oldCompare();assert.equal(view.compareFrames,before);
newCompare();assert.equal(view.compareFrames,before+1);
view.el.btnStop.click();assert.equal(view.state,'finished');
const pending=frames.pop();pending();assert.equal(view.compareFrames,before+1);
console.log('PASS main: Reset/Stop loại callback so sánh cũ, kể cả sau khi mở so sánh mới');

view.el.btnReset.click();start({maxGenerations:2});speed=50;tick();
assert.equal(trainers.at(-1).steps,2);assert.equal(view.state,'finished');
assert.equal(view.summaries.at(-1).reason,'generations');
assert.equal(saved.at(-1).latestPopulation.generation,2);
console.log('PASS main: x50 không vượt ngân sách generation; lưu gen đã đánh giá');

view.el.btnReset.click();clock=0;start({maxMinutes:0.1});clock=6000;tick();
assert.equal(trainers.at(-1).steps,0);assert.equal(view.summaries.at(-1).reason,'time');
console.log('PASS main: dừng theo thời gian trước khi chạy dư tick');

view.el.btnReset.click();speed=1;start({targetScore:10});trainers.at(-1).bestEverScore=10;tick();
assert.equal(view.summaries.at(-1).reason,'target');assert.equal(trainers.at(-1).steps,0);
console.log('PASS main: target stop không chạy dư tick');

view.el.btnReset.click();failSave=true;start();tick();assert.equal(view.state,'running');
assert(view.storageMessage.includes('quota'));failSave=false;
const current=trainers.at(-1);view.el.btnPause.click();
// Mô phỏng lựa chọn resume thất bại: không được tạo Trainer ngẫu nhiên thay thế.
view.el.btnStop.click();const count=trainers.length;start({resume:true,resumeId:'bad'});
assert.equal(trainers.length,count);assert.equal(trainers.at(-1),current);
assert(view.errors.some(error=>error.includes('lịch sử')));assert.equal(view.state,'finished');
console.log('PASS main: storage fail không dừng train; resume lỗi không fallback sang random');
console.log('\n6 nhóm kiểm tra lifecycle main đạt.');
