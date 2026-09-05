import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateBrain } from './js/brain.js';
import { evaluateBrain } from './js/evaluator.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = join(ROOT, '.data');
const DATA_FILE = join(DATA_DIR, 'hub.json');
const PORT = Number(process.env.PORT || 8000);
const SECRET = process.env.NEURO_HUB_SECRET || 'local-development-only-change-me';
if (process.env.NODE_ENV === 'production' && SECRET === 'local-development-only-change-me') {
  throw new Error('Production bắt buộc cấu hình NEURO_HUB_SECRET.');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
let db = { users: [], models: [] };

if (existsSync(DATA_FILE)) db = JSON.parse(await readFile(DATA_FILE, 'utf8'));
await mkdir(DATA_DIR, { recursive: true });
async function persist() { await writeFile(DATA_FILE, JSON.stringify(db, null, 2)); }
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1_200_000) throw new Error('Payload quá lớn.'); }
  return JSON.parse(raw || '{}');
}
function sign(value) { return createHmac('sha256', SECRET).update(value).digest('base64url'); }
function tokenFor(user) { const payload = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 30 * 864e5 })).toString('base64url'); return `${payload}.${sign(payload)}`; }
function currentUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload) !== signature) return null;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url')); return data.exp > Date.now() ? db.users.find((u) => u.id === data.id) : null; } catch { return null; }
}
function publicUser(user) { return user ? { id: user.id, username: user.username } : null; }
function categoryOf(brain) {
  if (brain.game === '2048') return brain.architecture.actionSchema === 'move-policy-v1' ? 'policy' : 'expectimax';
  return 'standard';
}
function publicModel(model, detail = false) {
  const category = categoryOf(model.brain);
  const peers = db.models.filter((m) => m.game === model.game && categoryOf(m.brain) === category).sort((a, b) => b.verified.mean - a.verified.mean);
  const value = { id: model.id, name: model.name, game: model.game, category, rank: peers.findIndex((m) => m.id === model.id) + 1, brainHash: model.brain.hash, parentHash: model.brain.lineage?.parentHash || null, author: publicUser(db.users.find((u) => u.id === model.userId)), verified: model.verified, createdAt: model.createdAt };
  if (detail) value.brain = model.brain;
  value.descendants = db.models.filter((m) => m.brain.lineage?.parentHash === model.brain.hash).length;
  return value;
}
function hiddenSeeds(game, category, count = 7) {
  const bytes = createHmac('sha256', SECRET).update(`eval:v1:${game}:${category}`).digest();
  return Array.from({ length: count }, (_, i) => bytes.readUInt32LE((i * 4) % 28) & 0x7fffffff);
}

async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const data = await body(req); const username = String(data.username || '').trim().toLowerCase(); const password = String(data.password || '');
    if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 8) return json(res, 400, { error: 'Tên 3–24 ký tự a-z/0-9/_; mật khẩu tối thiểu 8 ký tự.' });
    if (db.users.some((u) => u.username === username)) return json(res, 409, { error: 'Tên này đã tồn tại.' });
    const salt = randomBytes(16).toString('hex'); const passwordHash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
    const user = { id: randomUUID(), username, salt, passwordHash, createdAt: Date.now() }; db.users.push(user); await persist();
    return json(res, 201, { token: tokenFor(user), user: publicUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const data = await body(req); const user = db.users.find((u) => u.username === String(data.username || '').trim().toLowerCase());
    if (!user) return json(res, 401, { error: 'Sai tài khoản hoặc mật khẩu.' });
    const actual = pbkdf2Sync(String(data.password || ''), user.salt, 120000, 32, 'sha256'); const expected = Buffer.from(user.passwordHash, 'hex');
    if (!timingSafeEqual(actual, expected)) return json(res, 401, { error: 'Sai tài khoản hoặc mật khẩu.' });
    return json(res, 200, { token: tokenFor(user), user: publicUser(user) });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { user: publicUser(currentUser(req)) });
  if (req.method === 'GET' && url.pathname === '/api/models') {
    const game = url.searchParams.get('game'); const list = db.models.filter((m) => !game || m.game === game).sort((a, b) => b.verified.mean - a.verified.mean).slice(0, 100);
    return json(res, 200, { models: list.map((m) => publicModel(m)) });
  }
  const match = url.pathname.match(/^\/api\/models\/([^/]+)$/);
  if (req.method === 'GET' && match) { const model = db.models.find((m) => m.id === match[1]); return model ? json(res, 200, { model: publicModel(model, true) }) : json(res, 404, { error: 'Không tìm thấy Brain.' }); }
  if (req.method === 'POST' && url.pathname === '/api/models') {
    const user = currentUser(req); if (!user) return json(res, 401, { error: 'Cần đăng nhập để publish.' });
    const data = await body(req); const brain = validateBrain(data.brain); const name = String(data.name || '').trim().slice(0, 60);
    if (name.length < 3) return json(res, 400, { error: 'Tên Brain cần ít nhất 3 ký tự.' });
    if (db.models.some((m) => m.brain.hash === brain.hash)) return json(res, 409, { error: 'Brain này đã được publish.' });
    const maxSteps = brain.game === '2048' ? 8000 : 30000; const verified = evaluateBrain(brain, hiddenSeeds(brain.game, categoryOf(brain)), maxSteps);
    const model = { id: randomUUID(), userId: user.id, name, game: brain.game, brain, verified, createdAt: Date.now() }; db.models.push(model); await persist();
    return json(res, 201, { model: publicModel(model, true) });
  }
  return json(res, 404, { error: 'API không tồn tại.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    if (pathname.split('/').some((part) => part.startsWith('.'))
      || pathname === '/server.mjs' || pathname === '/package.json') {
      res.writeHead(404); return res.end('Not found');
    }
    const file = normalize(join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" });
    createReadStream(file).pipe(res);
  } catch (error) { json(res, 400, { error: error.message || 'Request không hợp lệ.' }); }
});
server.listen(PORT, () => console.log(`Neuroevolution Lab: http://localhost:${PORT}`));
