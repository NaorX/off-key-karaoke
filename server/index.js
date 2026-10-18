import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadEnv } from './env.js';
import { liveKitToken, liveKitConfig } from './livekit.js';
import { resolveVideo } from './youtube.js';
import { PackStore } from './storage.js';
import { SEED_PACKS } from './seed.js';
import { Lobby, cleanLook } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT || process.argv.find((a) => a.startsWith('--port='))?.slice(7) || 5180);

const packs = new PackStore(path.join(ROOT, 'data', 'packs.json'), SEED_PACKS);
const lobby = new Lobby(packs);

/* ---------- Static files ---------- */
const STATIC = {
  '/': path.join(ROOT, 'client'),
  '/vendor/livekit-client.mjs': path.join(ROOT, 'node_modules', 'livekit-client', 'dist', 'livekit-client.esm.mjs'),
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const PHOSPHOR = path.join(ROOT, 'node_modules', '@phosphor-icons', 'web', 'src');

/**
 * The client's version: the newest change to any of its files. Open pages poll this, so a player
 * who kept a tab open while the game was updated picks up the new version instead of a stale one.
 */
function clientVersion() {
  let newest = 0;
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) scan(f);
      else if (/\.(html|css|js)$/.test(e.name)) newest = Math.max(newest, fs.statSync(f).mtimeMs);
    }
  };
  try { scan(STATIC['/']); } catch {}
  return String(Math.round(newest));
}

function serveStatic(req, res, pathname) {
  let file = STATIC[pathname];
  if (!file && pathname.startsWith('/vendor/phosphor/')) {
    file = path.join(PHOSPHOR, path.normalize(decodeURIComponent(pathname.slice('/vendor/phosphor/'.length))).replace(/^([\/])+/, ''));
    if (!file.startsWith(PHOSPHOR)) return false;
  }
  if (!file) {
    const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([\\/])+/, '');
    file = path.join(STATIC['/'], rel);
    if (!file.startsWith(STATIC['/'])) return false;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return false;
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.startsWith(PHOSPHOR) ? 'max-age=86400' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ---------- JSON API ---------- */
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/packs' && req.method === 'GET') return json(res, 200, { packs: packs.list() });
  if (p === '/api/packs' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.name || !Array.isArray(body.songs)) return json(res, 400, { error: 'A pack needs a name and songs.' });
    const pack = packs.save(body, body.author);
    return json(res, 200, { pack });
  }
  const del = p.match(/^\/api\/packs\/([\w-]+)$/);
  if (del && req.method === 'DELETE') return json(res, packs.remove(del[1]) ? 200 : 404, {});
  if (p === '/api/youtube') return json(res, 200, await resolveVideo(url.searchParams.get('url')));
  if (p === '/api/rooms') return json(res, 200, { rooms: lobby.list() });
  if (p === '/api/version') return json(res, 200, { version: clientVersion() });
  if (p === '/api/voice-token' && req.method === 'POST') {
    const cfg = liveKitConfig();
    if (!cfg.ok) return json(res, 503, { error: 'Voice isn’t set up: fill in LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env' });
    const body = await readBody(req);
    const conn = conns.get(String(body.playerId || ''));
    if (!conn || !conn.room || conn.secret !== body.secret) return json(res, 403, { error: 'Join a room first.' });
    const token = liveKitToken({ apiKey: cfg.apiKey, apiSecret: cfg.apiSecret, room: `offkey-${conn.room.code}`, identity: conn.id, name: conn.name });
    return json(res, 200, { url: cfg.url, token, room: conn.room.code });
  }
  return json(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(`off-key: ${req.method} ${url.pathname}: ${err.message}`);
    if (!res.headersSent) json(res, 500, { error: 'Something went wrong on the server.' });
  }
});

/* ---------- Game connections ---------- */
const conns = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

wss.on('connection', (ws) => {
  const conn = {
    ws,
    id: null,
    secret: crypto.randomUUID(),
    name: 'Player',
    look: cleanLook({}),
    room: null,
    alive: true,
    send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    sendRaw(data) { if (ws.readyState === 1) ws.send(data); },
    error(msg) { this.send({ t: 'error', msg }); },
  };
  ws.on('pong', () => { conn.alive = true; });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') return conn.send({ t: 'pong', c: msg.c, s: Date.now() });
    if (msg.t === 'hello') {
      // Reuse the player id the browser kept, so a dropped connection can rejoin its game
      const wanted = /^[\w-]{8,40}$/.test(msg.playerId || '') ? msg.playerId : null;
      const old = wanted && conns.get(wanted);
      if (old && old !== conn) { old.ws.close(4000, 'Replaced'); }
      conn.id = wanted || crypto.randomUUID();
      conn.name = String(msg.name || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player';
      conn.look = cleanLook(msg.look);
      conns.set(conn.id, conn);
      conn.send({ t: 'welcome', playerId: conn.id, secret: conn.secret, serverNow: Date.now(), voice: liveKitConfig().ok });
      const room = old?.room || lobby.roomOf(conn.id);
      if (room) room.reattach(conn);
      return;
    }
    if (!conn.id) return;
    try { lobby.handle(conn, msg); } catch (err) { console.error(`off-key: ${msg.t}: ${err.stack}`); }
  });
  ws.on('close', () => {
    if (conn.id && conns.get(conn.id) === conn) conns.delete(conn.id);
    if (conn.room) conn.room.disconnect(conn);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    const c = [...conns.values()].find((x) => x.ws === ws);
    if (c && !c.alive) { ws.terminate(); continue; }
    if (c) c.alive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  const voice = liveKitConfig().ok ? 'voice: LiveKit ready' : 'voice: OFF (fill in .env)';
  console.log(`\n  🎤 Off Key is running at http://localhost:${PORT}   (${voice})\n`);
});
