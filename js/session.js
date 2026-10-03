/** State phiên chạy và đồng hồ thời gian hoạt động, độc lập với DOM/rAF. */
export class RunSession {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.runId = 0;
    this.state = 'idle';
    this.comparing = false;
    this.elapsedMs = 0;
    this.startedAt = null;
    this.settings = null;
  }
  get mode() { return this.comparing ? 'comparing' : this.state; }
  start(settings) {
    this.runId++;
    this.settings = settings;
    this.state = 'running';
    this.comparing = false;
    this.elapsedMs = 0;
    this.startedAt = this.now();
    return this.runId;
  }
  activeMs() { return this.elapsedMs + (this.startedAt === null ? 0 : this.now() - this.startedAt); }
  pause() {
    if (this.state !== 'running') return;
    this.elapsedMs = this.activeMs();
    this.startedAt = null;
    this.state = 'paused';
  }
  resume() {
    if (this.state !== 'paused') return;
    this.startedAt = this.now();
    this.state = 'running';
  }
  finish() {
    this.elapsedMs = this.activeMs();
    this.startedAt = null;
    this.state = 'finished';
    this.comparing = false;
    this.runId++; // Callback compare của lượt trước không được phép quay lại.
  }
  reset() {
    this.finish();
    this.state = 'idle';
    this.settings = null;
    this.elapsedMs = 0;
  }
  limitReason(completedGenerations) {
    if (this.state !== 'running') return null;
    if (this.settings.maxMinutes && this.activeMs() >= this.settings.maxMinutes * 60000) return 'time';
    if (this.settings.maxGenerations && completedGenerations >= this.settings.maxGenerations) return 'generations';
    return null;
  }
}
