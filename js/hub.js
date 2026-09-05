const TOKEN_KEY = 'neuroai:hub-token';
const PENDING_KEY = 'neuroai:pending-brain';
const el = (id) => document.getElementById(id);
let token = localStorage.getItem(TOKEN_KEY) || '';
let user = null;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.'); return data;
}
function metric(value) { return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 }); }
function gameLabel(game) { return { flappy: '🐦 Flappy Bird', snake: '🐍 Snake', '2048': '🔢 2048' }[game] || game; }
function updateAccount() { el('hub-user').textContent = user ? `@${user.username}` : 'Chưa đăng nhập'; el('btn-auth').textContent = user ? 'Đăng xuất' : 'Đăng nhập'; }
function pendingBrain() { try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; } }
function showPending() { el('publish-panel').classList.toggle('hidden', !pendingBrain()); }

async function loadModels() {
  const game = el('hub-game').value; const { models } = await api(`/api/models${game ? `?game=${game}` : ''}`);
  el('model-grid').innerHTML = models.length ? models.map((model) => `<article class="model-card"><div class="model-rank">#${model.rank}</div><p class="eyebrow">${gameLabel(model.game)} · ${model.category}</p><h3>${escapeHtml(model.name)}</h3><p class="model-score">${metric(model.verified.mean)} <small>mean score</small></p><p class="hint">median ${metric(model.verified.median)} · ${model.verified.runs} hidden seeds</p><div class="model-meta"><span>@${escapeHtml(model.author.username)}</span><span>${model.descendants} forks</span><span>#${model.brainHash}</span></div><a class="btn secondary" href="hub.html?model=${model.id}">Xem Brain</a></article>`).join('') : '<p class="hint">Chưa có Brain nào. Hãy publish champion đầu tiên.</p>';
}
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = value; return span.innerHTML; }
async function loadDetail(id) {
  const { model } = await api(`/api/models/${id}`); const parent = model.parentHash ? `#${model.parentHash}` : 'Random origin';
  el('model-detail').innerHTML = `<p class="eyebrow">${gameLabel(model.game)} · VERIFIED</p><h2>${escapeHtml(model.name)}</h2><p class="model-score">${metric(model.verified.mean)} <small>mean score</small></p><div class="detail-stats"><span>Median <b>${metric(model.verified.median)}</b></span><span>Min–max <b>${metric(model.verified.min)}–${metric(model.verified.max)}</b></span><span>Generation <b>${model.brain.result.generation}</b></span><span>Parameters <b>${model.brain.architecture.parameterCount}</b></span></div><p class="lineage">Dòng dõi: ${parent} → <b>#${model.brainHash}</b> → ${model.descendants} hậu duệ</p><button class="btn primary" id="btn-fork">🧬 Fork & Evolve</button>`;
  el('model-detail').classList.remove('hidden'); el('btn-fork').onclick = () => { sessionStorage.setItem('neuroai:fork-brain', JSON.stringify(model.brain)); location.href = 'index.html?fork=1'; };
}
async function auth(mode) {
  const username = el('auth-name').value; const password = el('auth-password').value;
  try { const data = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) }); token = data.token; user = data.user; localStorage.setItem(TOKEN_KEY, token); updateAccount(); el('auth-dialog').close(); }
  catch (error) { el('auth-status').textContent = error.message; el('auth-status').classList.add('error'); }
}
el('btn-auth').onclick = async () => { if (user) { token = ''; user = null; localStorage.removeItem(TOKEN_KEY); updateAccount(); } else el('auth-dialog').showModal(); };
el('btn-login').onclick = (event) => { event.preventDefault(); auth('login'); };
el('btn-register').onclick = (event) => { event.preventDefault(); auth('register'); };
el('hub-game').onchange = loadModels;
el('btn-publish').onclick = async () => {
  if (!user) return el('auth-dialog').showModal();
  const brain = pendingBrain(); if (!brain) return;
  el('publish-status').textContent = 'Server đang đánh giá trên hidden seeds…';
  try { const { model } = await api('/api/models', { method: 'POST', body: JSON.stringify({ name: el('model-name').value, brain }) }); sessionStorage.removeItem(PENDING_KEY); location.href = `hub.html?model=${model.id}`; }
  catch (error) { el('publish-status').textContent = error.message; el('publish-status').classList.add('error'); }
};
try { user = (await api('/api/me')).user; } catch { token = ''; localStorage.removeItem(TOKEN_KEY); }
updateAccount(); showPending(); await loadModels(); const modelId = new URLSearchParams(location.search).get('model'); if (modelId) await loadDetail(modelId);
