import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * A JSON file on disk. Writes go to a temp file that then replaces the real one, so a crash
 * mid-write can't corrupt it, and the previous version is kept as a .bak next to it.
 * Swapping this for Supabase later only means replacing PackStore below.
 */
class JsonFile {
  constructor(file, fallback) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = this.load(fallback);
    this.queue = Promise.resolve();
  }
  load(fallback) {
    for (const f of [this.file, `${this.file}.bak`]) {
      try {
        if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch (err) {
        console.error(`off-key: couldn't read ${f}: ${err.message}`);
      }
    }
    return typeof fallback === 'function' ? fallback() : fallback;
  }
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.queue = this.queue.then(() => {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, snapshot);
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`);
      try {
        fs.renameSync(tmp, this.file);
      } catch {
        fs.copyFileSync(tmp, this.file);
        fs.rmSync(tmp, { force: true });
      }
    }).catch((err) => console.error(`off-key: couldn't save ${this.file}: ${err.message}`));
    return this.queue;
  }
}

export const PACK_ICONS = ['microphone-stage', 'confetti', 'heart-break', 'fire', 'flower', 'guitar', 'music-notes', 'moon-stars', 'pizza', 'cat', 'crown', 'disco-ball', 'vinyl-record', 'piano-keys', 'microphone', 'star', 'headphones', 'balloon'];
const EMOJI_ICONS = { '🎤': 'microphone-stage', '🎉': 'confetti', '💔': 'heart-break', '🔥': 'fire', '🌸': 'flower', '🎸': 'guitar', '🎶': 'music-notes', '🌙': 'moon-stars', '🍕': 'pizza', '🐱': 'cat', '👑': 'crown', '🕺': 'disco-ball' };
/** The pack's icon name; older packs stored an emoji. */
export const packIcon = (p) => (PACK_ICONS.includes(p?.icon) ? p.icon : EMOJI_ICONS[p?.emoji] || 'microphone-stage');

const clampStr = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function cleanSong(s) {
  const videoId = String(s?.videoId || '');
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const start = num(s.start, 0, 3600, 0);
  const end = s.end == null || s.end === '' ? null : num(s.end, start + 5, 7200, null);
  // Where the chorus starts: short clips begin here so they land on the part everyone knows
  const hook = s.hook == null || s.hook === '' ? null : num(s.hook, start, end ?? 7200, null);
  return {
    id: /^[\w-]{6,24}$/.test(s.id || '') ? s.id : crypto.randomUUID().slice(0, 12),
    videoId,
    title: clampStr(s.title, 140) || 'Untitled',
    channel: clampStr(s.channel, 80),
    thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    start,
    hook,
    end,
    duration: num(s.duration, 1, 7200, null),
  };
}

export class PackStore {
  constructor(file, seed) {
    this.store = new JsonFile(file, () => ({ version: 1, packs: seed }));
    if (!this.store.data.packs) this.store.data = { version: 1, packs: [] };
    for (const p of this.store.data.packs) { p.icon = packIcon(p); delete p.emoji; }
    if (!fs.existsSync(file)) this.store.save();
  }
  list() { return this.store.data.packs; }
  get(id) { return this.list().find((p) => p.id === id) || null; }
  save(input, author) {
    const now = Date.now();
    const existing = input.id ? this.get(input.id) : null;
    const songs = (Array.isArray(input.songs) ? input.songs : []).map(cleanSong).filter(Boolean).slice(0, 100);
    const pack = {
      id: existing ? existing.id : crypto.randomUUID().slice(0, 10),
      name: clampStr(input.name, 40) || 'My Pack',
      icon: packIcon(input),
      color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#ff4d3d',
      author: existing ? existing.author : clampStr(author, 24) || 'Someone',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      songs,
    };
    const packs = this.list();
    const i = packs.findIndex((p) => p.id === pack.id);
    if (i >= 0) packs[i] = pack; else packs.push(pack);
    this.store.save();
    return pack;
  }
  /** Remember a video's length (reported by a player's YouTube player) on every song that uses it. */
  setDuration(videoId, seconds) {
    if (!/^[\w-]{11}$/.test(videoId) || !(seconds > 5 && seconds < 7200)) return;
    let changed = false;
    for (const p of this.list()) for (const s of p.songs) if (s.videoId === videoId && !s.duration) { s.duration = Math.round(seconds); changed = true; }
    if (changed) this.store.save();
  }
  remove(id) {
    const packs = this.list();
    const i = packs.findIndex((p) => p.id === id);
    if (i < 0) return false;
    packs.splice(i, 1);
    this.store.save();
    return true;
  }
}
