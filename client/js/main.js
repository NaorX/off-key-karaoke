import { createScene } from './scene.js';
import { createNet } from './net.js';
import { createVoice } from './voice.js';
import { createKaraoke, loadYouTube, PLAYER_VARS } from './karaoke.js';
import { ensureAudio, audioContext, sfx, setSfxVolume, setLounge, scheduleLounge } from './sound.js';
import { MISSIONS } from './missions.js';
import { POWERS, USE_TEXT } from './powers.js';

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#3d8bff', '#ff7aa2', '#ffc22e', '#25d39b', '#a98bff', '#ff8c42', '#ff5a4e', '#2bc8c4', '#8fc742', '#e8dfd0', '#6b7cff', '#ff9ecf', '#ffe066', '#7fe0c0', '#c7a2ff', '#c66b3d', '#d94f8a', '#4fa3c7', '#5f9e4f', '#8a90a8'];
const COLOR_NAMES = ['Ocean', 'Bubblegum', 'Sunny', 'Mint', 'Lilac', 'Tangerine', 'Tomato', 'Lagoon', 'Lime', 'Cream', 'Periwinkle', 'Cotton candy', 'Lemon', 'Seafoam', 'Lavender', 'Cinnamon', 'Raspberry', 'Denim', 'Forest', 'Pebble'];
const HAT_COLORS = ['', '#ff4d3d', '#ff8c42', '#ffc22e', '#25d39b', '#2bc8c4', '#3d8bff', '#a98bff', '#ff7aa2', '#e8dfd0', '#8a5a2b', '#5f9e4f', '#1d1b22'];
// Each hat's own color, shown as the first ("original") hat swatch
const HAT_DEFAULT = { buns: '#3a2418', astronaut: '#f2f2f6', frog: '#5fd35f', bear: '#8a5a2b', jester: '#a98bff', fez: '#c3271a', bucket: '#5f9e4f', backcap: '#e8463a', mohawk: '#ff3d8b', santa: '#e8333a', unicorn: '#ffd75a', devil: '#e8333a', antennae: '#7cff6a', grad: '#1d1b22', sombrero: '#e2b55c', sweatband: '#ff4d3d', pirate: '#1d1b22', mushroom: '#e8333a', viking: '#9aa3b5', bandana: '#e8463a', beret: '#d63c3c', bunny: '#ece5da', flowers: '#3fbf5c', afro: '#3a2418', headphones: '#1c1c22', bow: '#ff4d6d', cap: '#1d2a44', sprout: '#3fbf5c', party: '#f3ece4', beanie: '#2a2a32', crown: '#f2b322', cowboy: '#a8693a', tophat: '#1d1b22', catears: '#2a2530', propeller: '#3d8bff', wizard: '#3b3a9e', chef: '#f3ede4', halo: '#ffd75a' };
const FACES = [['none', 'No extras'], ['glasses', 'Glasses'], ['shades', 'Shades'], ['hearts', 'Heart shades'], ['monocle', 'Monocle'], ['mustache', 'Mustache'], ['freckles', 'Freckles'], ['lashes', 'Lashes'], ['bandage', 'Bandage'], ['beard', 'Beard'], ['eyepatch', 'Eye patch'], ['clown', 'Clown nose'], ['bandit', 'Bandit mask'], ['stickers', 'Star stickers'], ['whiskers', 'Whiskers'], ['pixel', 'Pixel shades'], ['goggles', 'Swim goggles'], ['heartcheeks', 'Heart cheeks'], ['disguise', 'Disguise']];
const MOODS = [['smile', 'Smile'], ['grin', 'Big grin'], ['sad', 'Sad'], ['angry', 'Angry'], ['smug', 'Smug'], ['shocked', 'Shocked'], ['sleepy', 'Sleepy'], ['wink', 'Wink'], ['love', 'In love'], ['starry', 'Starstruck'], ['cool', 'Cool'], ['goofy', 'Goofy'], ['laughing', 'Laughing'], ['shy', 'Shy'], ['teary', 'Teary'], ['evil', 'Evil grin'], ['dizzy', 'Dizzy'], ['angelic', 'Angelic'], ['nervous', 'Nervous'], ['kissy', 'Kissy']];
const OUTFITS = [['none', 'No outfit'], ['bowtie', 'Bow tie'], ['necktie', 'Necktie'], ['scarf', 'Scarf'], ['chain', 'Gold chain'], ['lei', 'Flower lei'], ['cape', 'Super cape'], ['tuxedo', 'Tuxedo'], ['suspenders', 'Suspenders'], ['medal', 'Gold medal'], ['guitar', 'Guitar'], ['wings', 'Angel wings'], ['backpack', 'Backpack'], ['hoodie', 'Hoodie'], ['apron', 'Apron'], ['pearls', 'Pearls'], ['tutu', 'Tutu'], ['emblem', 'Hero emblem'], ['rose', 'Rose']];
const HATS = [['none', 'No hat'], ['headphones', 'Headphones'], ['bow', 'Bow'], ['cap', 'Cap'], ['sprout', 'Sprout'], ['party', 'Party hat'], ['beanie', 'Beanie'], ['crown', 'Crown'], ['cowboy', 'Cowboy hat'], ['tophat', 'Top hat'], ['catears', 'Cat ears'], ['propeller', 'Propeller cap'], ['wizard', 'Wizard hat'], ['chef', 'Chef hat'], ['halo', 'Halo'], ['viking', 'Viking helmet'], ['bandana', 'Bandana'], ['beret', 'Beret'], ['bunny', 'Bunny ears'], ['flowers', 'Flower crown'], ['afro', 'Afro'], ['mohawk', 'Mohawk'], ['santa', 'Santa hat'], ['unicorn', 'Unicorn horn'], ['devil', 'Devil horns'], ['antennae', 'Antennae'], ['grad', 'Grad cap'], ['sombrero', 'Sombrero'], ['sweatband', 'Sweatband'], ['pirate', 'Pirate hat'], ['mushroom', 'Mushroom'], ['buns', 'Space buns'], ['astronaut', 'Astronaut'], ['frog', 'Frog hat'], ['bear', 'Bear ears'], ['jester', 'Jester hat'], ['fez', 'Fez'], ['bucket', 'Bucket hat'], ['backcap', 'Backwards cap']];
const RX = { clap: '👏', laugh: '😂', fire: '🔥', tomato: '🍅' };
const TIPS = ['Tip: press 4 to throw a tomato.', 'Tip: Q, W and E play your power-up cards.', 'Tip: headphones on, or your mic picks up the music.', 'Tip: vote close to the crowd’s average for a +10 bonus.', 'Tip: paste any YouTube karaoke link to build your own pack.'];

/** A player's avatar: their rendered 3D portrait (color and hat) when we have a look, else a flat face. */
function avatar(look) {
  if (look && typeof look === 'object') {
    const url = scene.portrait(look);
    return `<span class="av pt" style="--c:${look.color}"><img src="${url}" alt="" draggable="false"></span>`;
  }
  const color = look || '#888';
  return `<span class="av"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#2a2f5c"/><rect x="6" y="8" width="28" height="42" rx="14" fill="${color}"/>` +
    `<rect x="11" y="11.5" width="7" height="2.2" rx="1.1" fill="#16182b" transform="rotate(-8 14 12.6)"/><rect x="22" y="11.5" width="7" height="2.2" rx="1.1" fill="#16182b" transform="rotate(8 25 12.6)"/>` +
    `<ellipse cx="15" cy="19" rx="4.2" ry="4.7" fill="#fff"/><ellipse cx="25" cy="19" rx="4.2" ry="4.7" fill="#fff"/>` +
    `<circle cx="15.5" cy="19.8" r="2.2" fill="#16182b"/><circle cx="25.5" cy="19.8" r="2.2" fill="#16182b"/>` +
    `<path d="M16 27q4 3.4 8 0" stroke="#16182b" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>`;
}
const ic = (name, cls = 'ph-fill') => `<i class="${cls} ph-${name}"></i>`;
/** A pack's cover: up to four song thumbnails in a 2x2 grid, with the pack's icon badge. */
function cover(pack, cls = '') {
  const thumbs = (pack.songs || []).slice(0, 4).map((s) => `https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg`);
  const imgs = thumbs.length >= 4 ? thumbs.map((t) => `<img src="${t}" alt="" loading="lazy">`).join('') : thumbs.length ? `<img class="solo" src="${thumbs[0]}" alt="" loading="lazy">` : '';
  return `<span class="cover ${cls} ${thumbs.length ? '' : 'empty'}" style="--c:${pack.color}">${imgs}<span class="cv-badge">${ic(pack.icon || 'microphone-stage')}</span></span>`;
}
const fmt = (s) => (s == null || s === '' ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
function parseTime(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(\d+):(\d{1,2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function load(key, dflt) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? dflt; } catch { return dflt; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

const NOTICE_ICONS = { bad: 'ph-warning-circle', ok: 'ph-check-circle', '': 'ph-info' };
function notify(msg, kind = '', ms = 4200, action) {
  if ([...$('#notices').children].some((n) => n.dataset.msg === msg)) return;
  const el = document.createElement('div');
  el.className = `notice ${kind}`;
  el.dataset.msg = msg;
  el.innerHTML = `<i class="ph-fill ${NOTICE_ICONS[kind] || NOTICE_ICONS['']}"></i><span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.run(); el.remove(); };
    el.appendChild(b);
  }
  $('#notices').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* =====================================================================
   State
   ===================================================================== */
const S = {
  me: { id: localStorage.getItem('offkey.id') || '', secret: '', name: load('offkey.name', `Singer${Math.floor(rand(10, 99))}`), look: load('offkey.look', { color: pick(COLORS), hat: pick(HATS)[0] }) },
  prefs: load('offkey.prefs', { music: 0.8, voice: 1, sfx: 0.8, delay: 200 }),
  stats: load('offkey.stats', { songs: 0, best: 0 }),
  room: null,
  packs: [],
  screen: 'loading',
  voiceOk: false,
  speakers: new Set(),
  phaseKey: '',
  turnSetup: -1,
  phaseT0: 0,
  verdict: { shown: 0, scored: false },
  hype: 0.5,
  hypeAt: 0,
  sabsSeen: 0,
  lastCount: null,
  voiceState: 'off',
  syncDelay: 180,
};
save('offkey.name', S.me.name);
// The old cream glowed under the stage lights; move saved looks to the softer one
if (S.me.look.color === '#f2ede4') S.me.look.color = '#e8dfd0';
if (S.me.look.hatColor === '#f2ede4') S.me.look.hatColor = '#e8dfd0';
save('offkey.look', S.me.look);
const meInRoom = () => S.room?.players.find((p) => p.id === S.me.id) || null;
const isHost = () => S.room && S.room.hostId === S.me.id;
const player = (id) => S.room?.players.find((p) => p.id === id) || null;
const nameOf = (id) => (id === S.me.id ? 'You' : player(id)?.name || '?');
const iSing = () => S.room && S.room.singerId === S.me.id;
const crowdIds = () => (S.room ? S.room.players.filter((p) => p.id !== S.room.singerId && (p.connected || p.bot)).map((p) => p.id) : []);

/* =====================================================================
   Systems
   ===================================================================== */
for (const slot of $$('.logo-slot')) slot.appendChild($('#logo-tpl').content.cloneNode(true));
$('#ldTip').textContent = pick(TIPS);

const scene = createScene($('#scene'));
const net = createNet({
  hello: () => ({ playerId: S.me.id || undefined, name: S.me.name, look: S.me.look }),
  onMessage,
  onStatus: (s) => {
    if (s === 'replaced') {
      voice.leave();
      karaoke.stop();
      $('#m-replaced').classList.add('open');
      return;
    }
    if (s === 'closed' && S.screen !== 'loading') notify('Lost connection to the game. Reconnecting…', 'bad', 2500);
  },
});
const voice = createVoice({
  onState: (s, detail) => { S.voiceState = s; renderVoice(detail); if (s === 'on') hookMicMeter(); },
  onSpeakers: (ids) => { S.speakers = new Set(ids); },
});
const karaoke = createKaraoke('ytPlayer', { onError: (msg) => notify(`${msg} Skipping the music for this one.`, 'bad') });

/* Local mic meter straight from the published track (smooth, no network round trip) */
let micAnalyser = null, micBuf = null, micLevel = 0;
function hookMicMeter() {
  const track = voice.localTrack()?.mediaStreamTrack;
  const ctx = ensureAudio();
  if (!track || !ctx) return;
  const src = ctx.createMediaStreamSource(new MediaStream([track]));
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 1024;
  micBuf = new Float32Array(1024);
  src.connect(micAnalyser);
}
function readMicLevel() {
  if (!micAnalyser || voice.isMuted()) return 0;
  micAnalyser.getFloatTimeDomainData(micBuf);
  let s = 0;
  for (let i = 0; i < micBuf.length; i++) s += micBuf[i] * micBuf[i];
  return clamp(Math.sqrt(s / micBuf.length) * 7, 0, 1);
}

/* =====================================================================
   Screens and the wipe transition
   ===================================================================== */
let wiping = null;
let wantScreen = null;
async function goScreen(name) {
  wantScreen = name;
  if (wiping) return;
  if (S.screen === name) return;
  if (S.screen === 'loading') { applyScreen(name); return; }
  wiping = (async () => {
    const w = $('#wipe');
    sfx.whoosh();
    w.className = 'in';
    await sleep(480);
    applyScreen(wantScreen);
    await sleep(80);
    w.className = 'out';
    await sleep(520);
    w.className = '';
    wiping = null;
    if (wantScreen !== S.screen) goScreen(wantScreen);
  })();
}
function applyScreen(name) {
  S.screen = name;
  document.body.dataset.screen = name;
  $$('.modal').forEach((m) => m.classList.remove('open'));
  setLounge(name !== 'game');
  if (name === 'menu') {
    document.body.dataset.phase = '';
    scene.setPlayers([{ id: S.me.id || 'me', look: S.me.look }]);
    scene.setLayout('menu', { me: S.me.id || 'me' });
    scene.setShot('menu');
    scene.setFocus(false);
    scene.setLights(1);
    scene.clearSplats();
  }
  if (name === 'lobby') { document.body.dataset.phase = ''; renderLobby(true); }
  if (name === 'game') { S.phaseKey = ''; S.turnSetup = -1; onRoomGame(); }
  if (name === 'final') { document.body.dataset.phase = ''; renderFinal(true); }
}

/* A new version of the game went live while this tab was open: reload between games, or offer it mid-game */
let loadedVersion = null;
let versionNoticed = false;
async function checkVersion() {
  try {
    const { version } = await (await fetch('/api/version', { cache: 'no-store' })).json();
    if (!loadedVersion) { loadedVersion = version; return; }
    if (version === loadedVersion || versionNoticed) return;
    if (S.screen === 'menu' || S.screen === 'lobby') { location.reload(); return; }
    versionNoticed = true;
    notify('A new version of Off Key is ready.', '', 600000, { label: 'REFRESH', run: () => location.reload() });
  } catch {}
}
checkVersion();
setInterval(checkVersion, 30000);
addEventListener('focus', checkVersion);

/* =====================================================================
   Messages from the server
   ===================================================================== */
function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      S.me.id = m.playerId;
      S.me.secret = m.secret;
      S.voiceOk = m.voice;
      localStorage.setItem('offkey.id', m.playerId);
      renderVoice();
      welcomed?.();
      return;
    case 'room': onRoom(m.room); return;
    case 'react': onReact(m); return;
    case 'power': onPower(m); return;
    case 'mission': onMission(m); return;
    case 'error': notify(m.msg, 'bad'); resetHand(); return;
    case 'kicked': notify('The host removed you from the room.', 'bad'); leaveRoom(true); return;
    case 'kick': if (m.id !== S.me.id) { notify(`${m.name} was kicked from the room.`, '', 2600); sfx.leave(); } return;
    case 'left': return;
  }
}
let welcomed = null;

function onRoom(view) {
  const wasIn = !!S.room;
  const prevPlayers = S.room ? S.room.players.map((p) => p.id) : [];
  S.room = view;
  S.hype = view.hype;
  S.hypeAt = net.now();
  if (!wasIn) {
    if (S.voiceOk) voice.join({ playerId: S.me.id, secret: S.me.secret });
    history.replaceState(null, '', `/?room=${view.code}`);
  }
  const ids = view.players.map((p) => p.id);
  if (wasIn && S.screen === 'lobby') {
    if (ids.length > prevPlayers.length) sfx.join();
    if (ids.length < prevPlayers.length) sfx.leave();
  }
  scene.setPlayers(view.players);
  const target = view.phase === 'lobby' ? 'lobby' : view.phase === 'final' ? 'final' : 'game';
  if (S.screen !== target) goScreen(target);
  else if (target === 'lobby') renderLobby(false);
  else if (target === 'game') onRoomGame();
  else renderFinal(false);
}

function leaveRoom(silent) {
  if (!silent) net.send({ t: 'leave' });
  S.room = null;
  S.phaseKey = '';
  S.turnSetup = -1;
  karaoke.stop();
  voice.leave();
  micAnalyser = null;
  history.replaceState(null, '', '/');
  goScreen('menu');
}

/* =====================================================================
   Menu: your singer
   ===================================================================== */
const nameInput = $('#nameInput');
nameInput.value = S.me.name;
let profileTimer = 0;
function pushProfile() {
  save('offkey.name', S.me.name);
  save('offkey.look', S.me.look);
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => net.send({ t: 'profile', name: S.me.name, look: S.me.look }), 250);
}
nameInput.addEventListener('input', () => { S.me.name = nameInput.value.trim().slice(0, 16) || 'Player'; pushProfile(); });
/*
 * The wardrobe: five tabs. Hat, Mood, Face and Outfit show your own singer wearing each option
 * (little 3D renders), so you pick by sight; Hat also has a row of colors, Color has the body colors.
 */
let lookTab = 'hat';
const TABS = {
  hat: { key: 'hat', list: HATS, frame: 'head' },
  mood: { key: 'mood', list: MOODS, frame: 'head', zoom: true },
  face: { key: 'face', list: FACES, frame: 'head', zoom: true },
  outfit: { key: 'outfit', list: OUTFITS, frame: 'body' },
};
function renderWardrobe() {
  const L = S.me.look;
  $$('#lbTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === lookTab));
  const sw = $('#swatches');
  const colors = $('#lookColors');
  const tab = TABS[lookTab];
  let label, sig, html;
  if (!tab) {
    label = COLOR_NAMES[COLORS.indexOf(L.color)] || 'Color';
    sig = 'color';
    html = COLORS.map((c, i) => `<button class="swatch" style="--c:${c}" data-c="${c}" title="${COLOR_NAMES[i]}"></button>`).join('');
  } else {
    const cur = L[tab.key] || tab.list[0][0];
    label = tab.list.find(([k]) => k === cur)?.[1] || '';
    // Thumbnails depend on everything except the option this tab changes
    sig = `${lookTab}|${JSON.stringify({ ...L, [tab.key]: null })}`;
    html = tab.list.map(([k, n]) => `<button class="swatch thumb${tab.zoom ? ' zoom' : ''}" data-k="${k}" title="${n}"><img src="${scene.portrait({ ...L, [tab.key]: k }, tab.frame)}" alt="" draggable="false"></button>`).join('');
  }
  $('#hatName').textContent = label;
  if (sw.dataset.sig !== sig) {
    sw.innerHTML = html;
    sw.dataset.sig = sig;
    sw.classList.toggle('thumbs', !!tab);
  }
  // Hat colors sit under the hat grid (not for "no hat")
  const showColors = lookTab === 'hat' && L.hat !== 'none';
  const csig = showColors ? `hc|${L.hat}` : '';
  if (colors.dataset.sig !== csig) {
    colors.innerHTML = showColors ? HAT_COLORS.map((c) => `<button class="swatch${c ? '' : ' orig'}" style="--c:${c || HAT_DEFAULT[L.hat] || '#888'}" data-hc="${c}" title="${c ? 'Hat color' : 'Original color'}"></button>`).join('') : '';
    colors.dataset.sig = csig;
  }
  $$('#swatches .swatch').forEach((b) => b.classList.toggle('on', tab ? b.dataset.k === (L[tab.key] || tab.list[0][0]) : b.dataset.c === L.color));
  $$('#lookColors .swatch').forEach((b) => b.classList.toggle('on', b.dataset.hc === (L.hatColor || '')));
}
function setLook(patch) {
  S.me.look = { ...S.me.look, ...patch };
  renderLook();
  scene.jump(S.me.id || 'me', 1);
  sfx.pop(620);
  pushProfile();
}
$('#lbTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b || b.dataset.tab === lookTab) return;
  lookTab = b.dataset.tab;
  sfx.pop(520);
  renderWardrobe();
});
$('#lookBar').addEventListener('click', (e) => {
  const b = e.target.closest('.swatch');
  if (!b) return;
  if (b.dataset.hc !== undefined) setLook({ hatColor: b.dataset.hc });
  else if (b.dataset.c) setLook({ color: b.dataset.c });
  else if (b.dataset.k) setLook({ [TABS[lookTab].key]: b.dataset.k });
});
function renderLook() {
  renderWardrobe();
  $('#pcPortrait').innerHTML = avatar(S.me.look);
  const lvl = 1 + Math.floor(S.stats.songs / 2);
  $('#pcLevel').textContent = `LVL ${lvl}`;
  $('#pcSub').textContent = S.stats.songs ? `${S.stats.songs} song${S.stats.songs === 1 ? '' : 's'} · best ${S.stats.best}` : 'Ready for the first song';
  if (S.screen === 'menu') scene.setPlayers([{ id: S.me.id || 'me', look: S.me.look }]);
}
$('#playerCard').addEventListener('click', () => nameInput.focus());
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

/** Phones (and any tall, narrow window) get their own layout. Keep in sync with the media query in style.css. */
/** A touch screen with no mouse: no keyboard hints, no hover-only details. */
const TOUCH = matchMedia('(hover: none)').matches;
if (TOUCH) document.body.classList.add('touch');
const PHONE = matchMedia('(max-aspect-ratio: 4/5), (max-width: 640px)');
const isPhone = () => PHONE.matches;
PHONE.addEventListener('change', () => { document.body.classList.remove('dressing'); placeMenuUI(); });

/* Phone wardrobe: a sheet that slides up over the stage, opened from the name card */
function setDressing(on) {
  document.body.classList.toggle('dressing', on);
  sfx.pop(on ? 620 : 480);
}
$('#pcStyle').addEventListener('click', (e) => { e.stopPropagation(); setDressing(true); });
$('#lbDone').addEventListener('click', () => setDressing(false));

/* Phone lobby: songs, rules and voice share one panel behind tabs */
document.body.dataset.lt = 'songs';
$('#lobbyTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lt]');
  if (!b) return;
  sfx.pop(560);
  document.body.dataset.lt = b.dataset.lt;
  $$('#lobbyTabs button').forEach((x) => x.classList.toggle('on', x === b));
});

/** Short landscape screens show the desktop layout scaled down; this is the scale (1 elsewhere). */
const SHORT = matchMedia('(orientation: landscape) and (max-height: 600px) and (min-aspect-ratio: 4/5)');
function uiZoom() { return SHORT.matches ? Math.min(innerWidth / 1280, innerHeight / 780) : 1; }
function applyZoom() { document.documentElement.style.setProperty('--uiz', uiZoom().toFixed(3)); }
applyZoom();
addEventListener('resize', applyZoom);

/** Keep the player card and wardrobe hugging the 3D character on the menu stage. */
function placeMenuUI() {
  if (S.screen !== 'menu') return;
  const pc = $('#playerCard');
  const lb = $('#lookBar');
  // On a phone they sit in the page flow instead
  if (isPhone()) { pc.style.translate = ''; lb.style.translate = ''; return; }
  const id = S.me.id || 'me';
  const head = scene.anchorOf(id, 1.9);
  const feet = scene.anchorOf(id, 0);
  if (!head || !feet) return;
  const h = feet.y - head.y;
  // The name card and wardrobe start just past the shoulder (pulled left only if they'd hit the menu
  // buttons), and sit high enough that the tall wardrobe stays on screen
  // Work in screen pixels, then hand the result back in the (possibly scaled-down) UI's own pixels
  const z = uiZoom();
  const colLeft = $('.menu-col').getBoundingClientRect().left;
  const cx = Math.min(head.x + h * 0.36, colLeft - 28 * z - Math.max(pc.offsetWidth, lb.offsetWidth) * z);
  const total = (pc.offsetHeight + 16 + lb.offsetHeight) * z;
  const cy = Math.max(84 * z, Math.min(head.y - pc.offsetHeight * z * 0.55, innerHeight - 40 * z - total));
  // Position with the `translate` property so hover/press `scale` never moves the button away from the cursor
  pc.style.translate = `${cx / z}px ${cy / z}px`;
  lb.style.translate = `${cx / z + 10}px ${cy / z + pc.offsetHeight + 16}px`;
}

/** The song-pack showcase on the menu: three fanned covers and a count. */
function renderShowcase() {
  const songs = S.packs.flatMap((p) => p.songs);
  const picks = [...songs].sort(() => Math.random() - 0.5).slice(0, 3);
  $('#scThumbs').innerHTML = picks.map((s) => `<img src="https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg" alt="">`).join('');
  $('#scTitle').textContent = 'Song packs';
  $('#scSub').textContent = `${S.packs.length} pack${S.packs.length === 1 ? '' : 's'} · ${songs.length} songs ready`;
}
renderLook();

/* =====================================================================
   Rooms list
   ===================================================================== */
let roomsTimer = 0;
async function refreshRooms() {
  let rooms = [];
  try { rooms = (await (await fetch('/api/rooms')).json()).rooms; } catch {}
  const players = rooms.reduce((s, r) => s + r.players, 0);
  $('#onlineTxt span').textContent = rooms.length ? `${rooms.length} room${rooms.length > 1 ? 's' : ''} · ${players} player${players === 1 ? '' : 's'}` : 'No open rooms';
  $('#roomList').innerHTML = rooms.length ? rooms.map((r) => `
    <div class="room ${r.phase !== 'lobby' ? 'ingame' : ''}">
      ${avatar(COLORS[r.code.charCodeAt(0) % COLORS.length])}
      <div><div class="room-name">${esc(r.host)}’s room</div><div class="room-sub">${r.phase === 'lobby' ? `${ic('music-notes')}${esc(r.packs.join(', ') || 'No packs picked yet')}` : `${ic('microphone-stage')}Game in progress`}</div></div>
      <span class="room-count">${ic('users-three')}${r.players}/${r.max}</span>
      <button class="btn btn-md mint" data-join="${r.code}" ${r.phase !== 'lobby' || r.players >= r.max ? 'disabled' : ''}>${ic('play')}<span class="lbl">JOIN</span></button>
    </div>`).join('') : `<div class="empty"><span class="em-ic">${ic('microphone-stage', 'ph-duotone')}</span><b>It’s quiet in here</b>Create a room and invite your friends with the code.</div>`;
  $$('[data-join]').forEach((b) => b.addEventListener('click', () => { sfx.click(); net.send({ t: 'join', code: b.dataset.join }); }));
}
function openRooms() {
  $('#m-rooms').classList.add('open');
  refreshRooms();
  clearInterval(roomsTimer);
  roomsTimer = setInterval(() => { if ($('#m-rooms').classList.contains('open')) refreshRooms(); else clearInterval(roomsTimer); }, 3000);
}

/* =====================================================================
   Lobby
   ===================================================================== */
async function loadPacks() {
  try { S.packs = (await (await fetch('/api/packs')).json()).packs; } catch { S.packs = []; }
  renderShowcase();
  if ($('#m-library').classList.contains('open')) renderLibrary();
}
function renderPacks() {
  const sel = new Set(S.room?.settings.packIds || []);
  const host = isHost();
  $('#packHint').textContent = host ? 'Pick the packs to sing from.' : 'The host picks the packs.';
  $('#packList').innerHTML = S.packs.map((p) => `
    <div class="pack ${sel.has(p.id) ? 'on' : ''}" data-pack="${p.id}">
      ${cover(p)}
      <div><div class="nm">${esc(p.name)}</div><div class="ct"><span>${ic('music-notes')}${p.songs.length}</span><button class="edit" data-edit="${p.id}">${ic('pencil-simple')}Edit</button></div></div>
      <span class="check">${ic('check')}</span>
    </div>`).join('') || `<div class="empty"><span class="em-ic">${ic('music-notes', 'ph-duotone')}</span><b>No packs yet</b>Create one with your favorite karaoke videos.</div>`;
  const songs = S.packs.filter((p) => sel.has(p.id)).reduce((n, p) => n + p.songs.length, 0);
  $('#songCount').innerHTML = `${ic('music-notes')}<span>${songs} song${songs === 1 ? '' : 's'}</span>`;
  $$('#packList .pack').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-edit]')) return;
    if (!isHost()) return;
    const ids = new Set(S.room.settings.packIds);
    ids.has(el.dataset.pack) ? ids.delete(el.dataset.pack) : ids.add(el.dataset.pack);
    sfx.click();
    net.send({ t: 'settings', patch: { packIds: [...ids] } });
  }));
  $$('#packList [data-edit]').forEach((b) => b.addEventListener('click', () => { sfx.click(); openEditor(S.packs.find((p) => p.id === b.dataset.edit)); }));
}
/** The player strip under the LOBBY banner: everyone in the room, plus one invite slot. */
function renderSlots(force) {
  const r = S.room;
  const html = r.players.map((p) => {
    const host = p.id === r.hostId;
    const st = host ? `<span class="st host">${ic('crown-simple')}HOST</span>` : p.bot ? `<span class="st ok">${ic('robot')}BOT</span>` : p.ready ? `<span class="st ok">${ic('check-circle')}READY</span>` : `<span class="st">${ic('hourglass-medium')}NOT READY</span>`;
    const more = p.id !== S.me.id ? `<i class="ph-fill ph-dots-three-vertical more"></i>` : '';
    return `<div class="slot ${p.id === S.me.id ? 'me' : ''} ${mutedPeers.has(p.id) ? 'muted-me' : ''}" data-id="${p.id}" ${p.id !== S.me.id ? 'data-pm' : ''}>${avatar(p.look)}<span class="talk-badge">${ic('microphone')}</span><span class="sn"><b>${esc(p.id === S.me.id ? 'You' : p.name)}</b>${st}</span>${more}</div>`;
  }).join('') + (r.players.length < 6 ? `<button class="slot invite" id="inviteSlot"><span class="plus">${ic('plus')}</span>INVITE</button>` : '');
  if (force || $('#slots').dataset.html !== html) {
    $('#slots').innerHTML = html;
    $('#slots').dataset.html = html;
    $$('#slots [data-pm]').forEach((el) => el.addEventListener('click', () => openPlayerMenu(el.dataset.id, el)));
    $('#inviteSlot')?.addEventListener('click', copyInvite);
  }
}

function renderLobby(entering) {
  const r = S.room;
  if (!r) return;
  const host = isHost();
  $('#roomCode').textContent = r.code;
  $('#s-lobby .side-l').classList.toggle('locked', !host);
  $('#s-lobby .rules').classList.toggle('locked', !host);
  renderPacks();
  $$('.seg[data-setting]').forEach((seg) => $$('button', seg).forEach((b) => b.classList.toggle('on', String(r.settings[seg.dataset.setting]) === b.dataset.v)));
  $$('.toggle[data-setting]').forEach((t) => t.classList.toggle('on', t.dataset.setting === 'isPublic' ? r.isPublic : !!r.settings[t.dataset.setting]));
  const humans = r.players.filter((p) => !p.bot);
  const readyCount = r.players.filter((p) => p.bot || p.ready || p.id === r.hostId).length;
  const waiting = humans.filter((p) => !p.ready && p.id !== r.hostId);
  const songs = S.packs.filter((p) => r.settings.packIds.includes(p.id)).reduce((s, p) => s + p.songs.length, 0);
  let line;
  if (r.players.length < 2) line = `${ic('user-plus')}Waiting for players. Share the code, or add a bot.`;
  else if (!songs) line = `${ic('music-notes')}Pick at least one song pack.`;
  else if (waiting.length) line = `${ic('hourglass-medium')}<b>${readyCount}/${r.players.length}</b> ready · waiting for ${esc(waiting.map((p) => p.name).join(', '))}`;
  else line = `${ic('check-circle')}<b>${readyCount}/${r.players.length}</b> ready · ${host ? 'start when you are!' : 'waiting for the host to start'}`;
  $('#readyLine').innerHTML = line;
  renderSlots();
  $('#startBtn').hidden = !host;
  $('#addBotBtn').hidden = !host;
  $('#readyBtn').hidden = host;
  $('#startBtn').disabled = r.players.length < 2 || !songs;
  $('#addBotBtn').disabled = r.players.length >= 6;
  const me = meInRoom();
  $('#readyBtn').classList.toggle('on', !!me?.ready);
  $('#readyBtn .lbl').textContent = me?.ready ? 'NOT READY' : 'READY!';
  scene.setLayout('lobby', { ids: r.players.map((p) => p.id) });
  scene.setShot('lobby');
  scene.setFocus(false);
  scene.setLights(1);
  if (entering) scene.clearSplats();
}

$$('.seg[data-setting] button').forEach((b) => b.addEventListener('click', () => {
  if (!isHost()) return;
  const k = b.closest('.seg').dataset.setting;
  sfx.click();
  net.send({ t: 'settings', patch: { [k]: k === 'rounds' ? Number(b.dataset.v) : b.dataset.v } });
}));
$$('.toggle[data-setting]').forEach((t) => t.addEventListener('click', () => {
  if (!isHost()) return;
  const k = t.dataset.setting;
  sfx.click();
  if (k === 'isPublic') net.send({ t: 'visibility', isPublic: !S.room.isPublic });
  else net.send({ t: 'settings', patch: { [k]: !S.room.settings[k] } });
}));
async function copyInvite() {
  const link = `${location.origin}/?room=${S.room?.code}`;
  try { await navigator.clipboard.writeText(link); } catch {}
  $('#copyCode .lbl').textContent = 'COPIED!';
  notify('Invite link copied. Send it to your friends!', 'ok', 2500);
  sfx.ding();
  setTimeout(() => { $('#copyCode .lbl').textContent = 'COPY LINK'; }, 1400);
}
$('#copyCode').addEventListener('click', copyInvite);
// On a phone the whole code chip copies the invite
$('.code-box').addEventListener('click', () => { if (isPhone()) copyInvite(); });

/* =====================================================================
   Voice UI
   ===================================================================== */
function renderVoice(detail) {
  const st = S.voiceState;
  const muted = voice.isMuted();
  const text = !S.voiceOk ? 'Voice is off (not set up)' :
    st === 'on' ? (muted ? 'Muted' : 'Voice on') :
    st === 'connecting' ? 'Connecting…' :
    st === 'reconnecting' ? 'Reconnecting…' :
    st === 'blocked' ? 'Click anywhere to hear voices' :
    st === 'nomic' ? (detail || 'No microphone') :
    st === 'error' ? (detail || 'Voice unavailable') : 'Join a room to talk';
  $('#voiceState').textContent = text;
  for (const b of [$('#micBtn'), $('#micBtn2')]) {
    b.classList.toggle('muted', st === 'on' && muted);
    b.classList.toggle('off', st !== 'on');
  }
  const pill = $('#voicePill');
  pill.classList.toggle('ok', S.voiceOk);
  pill.classList.toggle('bad', !S.voiceOk);
  $('span', pill).textContent = S.voiceOk ? 'Voice chat ready' : 'Voice chat off';
  if (detail && (st === 'nomic' || st === 'error')) notify(detail, 'bad');
}
async function toggleMute() {
  if (S.voiceState !== 'on') { notify(S.voiceOk ? 'Voice isn’t connected yet.' : 'Voice isn’t set up on this server.', 'bad', 2500); return; }
  await voice.setMuted(!voice.isMuted());
  sfx.click();
  renderVoice();
}
$('#micBtn').addEventListener('click', toggleMute);
$('#micBtn2').addEventListener('click', toggleMute);
addEventListener('pointerdown', () => { ensureAudio(); voice.resumeAudio(); });

/* =====================================================================
   The round
   ===================================================================== */
function onRoomGame() {
  const r = S.room;
  if (!r || S.screen !== 'game') return;
  document.body.dataset.role = iSing() ? 'singer' : 'crowd';
  $('#s-game').classList.toggle('no-tomato', !r.settings.tomatoes);
  const key = `${r.turn}:${r.phase}`;
  if (key !== S.phaseKey) {
    const prevPhase = S.phaseKey.split(':')[1];
    S.phaseKey = key;
    S.phaseT0 = performance.now();
    enterPhase(r.phase, prevPhase);
  }
  renderScoreboard();
  renderHand();
  renderMission();
  const round = Math.floor(Math.max(0, r.turn) / (r.roundLen || 1));
  $('#rcRound').textContent = `ROUND ${Math.min(round + 1, r.settings.rounds)}/${r.settings.rounds}`;
  // This round's singers in order: who's done, who's on, who's still to come
  const line = r.lineup || [];
  const at = r.phase === 'draw' ? -1 : Math.max(0, r.turn) % (r.roundLen || 1);
  const lineKey = `${line.join(',')}|${at}`;
  if ($('#rcLine').dataset.key !== lineKey) {
    $('#rcLine').dataset.key = lineKey;
    $('#rcLine').innerHTML = line.map((id, i) => `<span class="${i < at ? 'done' : i === at ? 'now' : ''}" title="${esc(nameOf(id))}">${avatar(player(id)?.look || '#888')}</span>`).join('');
  }
  $('#rcPhase').textContent = { roundEnd: 'ROUND DONE', draw: 'LUCKY DRAW', pick: 'SONG PICK', announce: iSing() ? 'YOUR TURN' : 'UP NEXT', sing: iSing() ? 'YOU’RE SINGING' : 'SINGING', vote: 'VOTING', verdict: 'THE VERDICT' }[r.phase] || '';
  const phaseIcon = { roundEnd: 'flag-checkered', draw: 'clover', pick: 'playlist', announce: 'microphone-stage', sing: 'music-notes', vote: 'check-square', verdict: 'star' }[r.phase] || 'microphone-stage';
  $('#rcIcon').className = `ph-fill ph-${phaseIcon}`;
  if (r.phase === 'pick') renderPick();
  if (r.phase === 'announce') {
    const left = r.players.filter((p) => !p.bot && p.connected && !r.cued.includes(p.id)).length;
    $('#anWait').textContent = !r.singerReady && !iSing() ? `Waiting for ${nameOf(r.singerId)} to get ready…` : left ? 'Loading the song for everyone…' : '';
  }
  if (r.phase === 'vote') {
    $$('#voters .vt').forEach((a) => {
      const done = r.voted.includes(a.dataset.id);
      if (done && !a.classList.contains('done')) sfx.click();
      a.classList.toggle('done', done);
    });
    $('#votersTxt').textContent = `${r.voted.length} of ${crowdIds().length} voted`;
  }
}

function enterPhase(phase) {
  const r = S.room;
  document.body.dataset.phase = phase;
  const singer = r.singerId;
  const sp = player(singer);
  // Each round's points are measured from the scores it started with
  if (!S.roundBase || (r.turn === 0 && (phase === 'draw' || phase === 'pick' || phase === 'announce') && r.players.every((p) => !p.score))) S.roundBase = new Map(r.players.map((p) => [p.id, p.score]));
  // The last song's score never lingers over the round's standings or the draw
  if (phase === 'roundEnd' || phase === 'draw' || phase === 'pick') $('#verdict').classList.remove('show');
  if (phase === 'roundEnd') {
    karaoke.stop();
    voice.setMode('chat');
    voice.setCrowd(new Map());
    clearEffects();
    scene.resetMoods();
    scene.clearSplats();
    scene.setLayout('lobby', { ids: r.players.filter((p) => p.connected || p.bot).map((p) => p.id) });
    scene.setShot('lobby');
    scene.setFocus(false);
    scene.setLights(1);
    caption('');
    renderRoundEnd();
    sfx.fanfare();
    return;
  }
  if (phase === 'draw') {
    karaoke.stop();
    voice.setMode('chat');
    voice.setCrowd(new Map());
    clearEffects();
    scene.resetMoods();
    scene.clearSplats();
    scene.setLayout('lobby', { ids: r.players.filter((p) => p.connected || p.bot).map((p) => p.id) });
    scene.setShot('lobby');
    scene.setFocus(false);
    scene.setLights(1);
    caption('');
    setupDraw();
    sfx.whoosh();
    return;
  }
  S.reels = null;
  if (phase === 'pick') {
    // The crowd picks the song; the singer waits on stage to find out what they're in for
    karaoke.stop();
    voice.setMode('chat');
    voice.setCrowd(new Map());
    clearEffects();
    scene.clearSplats();
    scene.resetMoods();
    scene.setLayout('game', { singer, crowd: crowdIds() });
    scene.setShot('announce');
    scene.setFocus(false);
    scene.setLights(1);
    S.pickKey = '';
    S.pickWon = -1;
    caption(iSing() ? 'No take-backs: whatever they pick, <span class="y">you sing!</span>' : 'Tap a song, or press <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>');
    sfx.whoosh();
    return;
  }
  if (S.turnSetup !== r.turn) setupTurn(phase === 'announce');
  if (phase === 'announce') {
    scene.setShot('announce');
    scene.setFocus(false);
    scene.setLights(1);
    caption(iSing() ? 'Check your mic, then hit <span class="y">I’M READY!</span>' : `<span class="y">${esc(sp?.name)}</span> is heading to the stage…`);
    sfx.ding();
  }
  if (phase === 'sing') {
    scene.setShot('sing');
    scene.setFocus(true);
    scene.setSinging(singer, true);
    const sabs = (meInRoom()?.hand || []).some((c) => POWERS[c.kind].type === 'sab');
    caption(iSing() ? '' : `React <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>${sabs ? ' · Cards <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd>' : ''}`);
    voice.setCrowd(new Map(crowdIds().map((id) => [id, r.settings.crowdVoice || 'distant'])));
  }
  if (phase === 'vote') {
    clearEffects();
    karaoke.stop();
    scene.setSinging(singer, false);
    scene.setTalk(singer, 0);
    scene.setLights(1);
    scene.setFocus(false);
    scene.setShot('vote');
    voice.setCrowd(new Map());
    if (iSing()) voice.setMode('chat');
    $('#voteTitle').textContent = `RATE ${(sp?.name || '?').toUpperCase()}!`;
    $('#vbtns').classList.remove('done');
    $$('.vb').forEach((b) => b.classList.remove('sel'));
    S.myVote = 0;
    // Everyone who still has to vote sits in the dark; a vote switches their light on
    $('#voters').innerHTML = crowdIds().map((id) => `<span class="vt" data-id="${id}" title="${esc(nameOf(id))}">${avatar(player(id)?.look || '#888')}<i class="ph-bold ph-check"></i></span>`).join('');
    caption(iSing() ? 'The crowd is voting on <span class="y">your</span> performance…' : 'Pick a score: <kbd>1</kbd> to <kbd>5</kbd>');
  }
  if (phase === 'verdict') {
    scene.setShot('cards');
    caption('The crowd holds up their scores…');
  }
}

/** Everything a turn needs, whether we saw it start or joined in the middle. */
function setupTurn(fromStart) {
  const r = S.room;
  const singer = r.singerId;
  const sp = player(singer);
  S.turnSetup = r.turn;
  scene.clearSplats();
  scene.resetMoods();
  scene.setLayout('game', { singer, crowd: crowdIds() });
  S.sabsSeen = fromStart ? 0 : r.sabs.length;
  S.lastCount = null;
  S.verdict = { shown: 0, scored: false, extrasShown: false };
  $('#verdict').classList.remove('show');
  $('#announce').classList.toggle('yours', iSing());
  $('#anKicker').textContent = iSing() ? 'IT’S YOUR TURN!' : 'UP NEXT';
  $('#anAv').innerHTML = avatar(sp?.look || '#888');
  $('#anWho').textContent = iSing() ? 'YOU!' : (sp?.name || '?').toUpperCase();
  $('#anSong').textContent = r.song.title;
  $('#anChannel').textContent = r.song.channel;
  $('#anThumb').src = `https://i.ytimg.com/vi/${r.song.videoId}/mqdefault.jpg`;
  // Under the video: "Artist - Song", without the channel's "(Karaoke Version)" tags
  const st = splitTitle(r.song.title);
  $('#tvTitle').textContent = st.artist ? `${st.artist} - ${st.song}` : st.song;
  $('#anHint').innerHTML = iSing()
    ? 'Sing along with the karaoke video. Hit the notes, own the stage, dodge the tomatoes.'
    : sp?.bot
      ? `${esc(sp.name)} is a bot, so you’ll only hear the music. Still worth a tomato or two.`
      : `${esc(sp?.name)} takes the stage. Cheer, laugh or throw tomatoes, then rate the performance.`;
  $('#singReady').disabled = false;
  voice.setMode(iSing() && r.phase !== 'vote' && r.phase !== 'verdict' ? 'stage' : 'chat');
  voice.setCrowd(r.phase === 'sing' ? new Map(crowdIds().map((id) => [id, r.settings.crowdVoice || 'distant'])) : new Map());
  if (r.phase === 'announce' || r.phase === 'sing') {
    karaoke.prepare(r.song, () => {
      if (S.room?.phase === 'announce') net.send({ t: 'cued' });
      const d = karaoke.duration();
      if (d > 5) net.send({ t: 'duration', videoId: r.song.videoId, seconds: d });
    });
  }
  $('#anClip').innerHTML = `${ic('timer')}${r.clip}s on stage`;
}

function caption(html) { const el = $('#caption'); if (el.innerHTML !== html) el.innerHTML = html; }
function toast(pid, html, icon) {
  const p = player(pid);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = avatar(p?.look || '#888') + `<span>${html}</span>` + (icon ? ic(icon) : '');
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2800);
}
function renderScoreboard() {
  const r = S.room;
  // Hold back this turn's points until the big reveal
  const hide = r.phase === 'verdict' && r.verdict && !S.verdict.scored;
  // Lucky Draw points only land when that player's reel stops
  const pending = new Map();
  if (r.phase === 'draw' && r.draw) {
    const t = net.now();
    for (const res of r.draw.results) if (t < res.revealAt && res.delta) {
      pending.set(res.id, (pending.get(res.id) || 0) + res.delta);
      if (res.victim) pending.set(res.victim, (pending.get(res.victim) || 0) - res.delta);
    }
  }
  const extraFor = (id) => (r.verdict?.extras || []).reduce((s, x) => s + (id === r.singerId ? x.pts : x.victim === id ? -x.pts : 0), 0);
  const cardsLanded = r.phase === 'verdict' && S.verdict.extrasShown;
  const shown = (p) => (hide ? p.score - (p.id === r.singerId ? r.verdict.pts : 0) - (r.verdict.bonus.includes(p.id) ? 10 : 0) - extraFor(p.id)
    : r.phase === 'verdict' && r.verdict && !cardsLanded ? p.score - extraFor(p.id) : p.score) - (pending.get(p.id) || 0);
  const html = r.players.map((p) => `
    <div class="sb ${p.id === S.me.id ? 'me' : ''} ${p.id === r.singerId ? 'singer' : ''} ${p.connected || p.bot ? '' : 'off'}" data-id="${p.id}">
      ${avatar(p.look)}<div><div class="nm">${esc(p.id === S.me.id ? 'You' : p.name)}</div><div class="pts">${shown(p)}</div></div>
      <span class="mic">${ic('microphone')}</span>${r.settings.powers !== 'off' && p.cards ? `<span class="cards-n" title="${p.cards} card${p.cards > 1 ? 's' : ''} in hand">${ic('cards')}${p.cards}</span>` : ''}${p.id === r.upNext?.[0] ? '<span class="next-tag">NEXT</span>' : ''}<span class="bump"></span></div>`).join('');
  const key = html.replace(/\s+/g, ' ');
  if ($('#scoreboard').dataset.key !== key) {
    $('#scoreboard').innerHTML = html;
    $('#scoreboard').dataset.key = key;
    $$('#scoreboard .sb').forEach((el) => { if (el.dataset.id !== S.me.id) { el.dataset.pm = ''; el.addEventListener('click', () => openPlayerMenu(el.dataset.id, el)); } });
  }
}

/* Per-frame game updates */
function updateGame() {
  const r = S.room;
  if (!r || S.screen !== 'game') return;
  const now = net.now();
  const singerIsBot = player(r.singerId)?.bot;
  voice.setSinger(r.phase === 'sing' && !iSing() && !singerIsBot ? r.singerId : null);
  if (r.phase === 'sing') {
    const delay = iSing() || singerIsBot ? 0 : S.syncDelay;
    // The crowd hears the backing track dip whenever the singer's voice comes in (a fast duck,
    // a slow release), so the voice always sits on top of the music
    let music = S.prefs.music;
    if (!iSing() && !singerIsBot) {
      const lvl = voice.liveLevel(r.singerId);
      const dt = Math.min(0.1, (performance.now() - (S.duckT || 0)) / 1000);
      S.duckT = performance.now();
      const target = lvl > 0.06 ? 1 : 0;
      S.duckEnv = (S.duckEnv || 0) + (target - (S.duckEnv || 0)) * Math.min(1, dt * (target > (S.duckEnv || 0) ? 14 : 1.6));
      music *= 0.82 - 0.32 * S.duckEnv;
    }
    karaoke.run({ now: now - delay, startAt: r.startAt, endAt: r.endAt, sabs: r.sabs, volume: music });
    // Count-in on the shared clock
    const toGo = (r.startAt - now) / 1000;
    const count = toGo > 0 ? Math.ceil(toGo) : toGo > -0.7 ? 0 : null;
    if (count !== S.lastCount) {
      S.lastCount = count;
      const el = $('#countin');
      if (count != null && count <= 3) {
        el.textContent = count === 0 ? 'SING!' : String(count);
        el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
        sfx.tick(count === 0);
      }
    }
    const on = (k) => r.sabs.some((x) => x.kind === k && now >= x.at && now < x.until);
    const lightsOut = on('lights');
    scene.setLights(lightsOut ? 0.06 : 1);
    for (const k of ['lights', 'fog', 'mirror', 'quake', 'shrink', 'bubbles']) $('#s-game').classList.toggle(`fx-${k}`, on(k));
    const disco = on('disco');
    scene.setDisco(disco);
    if (disco && now - (S.discoJump || 0) > 420) { S.discoJump = now; scene.jump(pick([r.singerId, ...crowdIds()]), 1); }
    if (on('quake')) scene.shake(0.25);
    // Voice effects are added to the singer's voice on each listener's side
    // Squeaky Hammer: the bonked singer goes silent for everyone from the moment it lands
    const bonked = r.sabs.some((x) => x.kind === 'bonk' && now >= x.at + POWERS.bonk.hit && now < x.until);
    const vfx = iSing() ? null : bonked ? 'mute' : ['echo', 'robot', 'megaphone'].find(on) || null;
    if (vfx !== (S.voiceFx || null)) { S.voiceFx = vfx; voice.setVoiceFx(vfx ? r.singerId : null, vfx); }
    scene.setBeat(Math.max(0, (now - r.startAt) / 1000) * 2);
    if (singerIsBot && now > r.startAt) scene.setTalk(r.singerId, 0.35 + Math.abs(Math.sin(now / 90)) * 0.5);
    const h = 0.5 + (S.hype - 0.5) * Math.exp(-0.06 * (now - S.hypeAt) / 1000);
    $('#hypeFill').style.height = `${h * 100}%`;
    $('#hype').classList.toggle('low', h < 0.3);
    $('#hype').classList.toggle('high', h > 0.72);
    const left = Math.max(0, (r.endAt - 600 - (now - delay)) / 1000);
    const total = Math.max(1, r.clip);
    const started = now - delay >= r.startAt;
    const secs = Math.ceil(started ? left : total);
    const tLabel = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if ($('#tvLeft').textContent !== tLabel) {
      $('#tvLeft').textContent = tLabel;
      if (started && secs <= 5 && secs > 0) sfx.tick(false);
    }
    const frac = started ? clamp(left / total, 0, 1) : 1;
    $('#tvRing').style.strokeDashoffset = `${(1 - frac) * 113.1}`;
    $('#tvBar').style.transform = `scaleX(${1 - frac})`;
    $('#tvTimer').classList.toggle('hurry', started && secs <= 5);
    $('#singLeft').textContent = tLabel;
    if (iSing()) {
      const lvl = readMicLevel();
      $('#singLevel').style.width = `${lvl * 100}%`;
      $('#singHint').textContent = bonked ? 'BONKED! Nobody can hear you for a moment!' : lightsOut ? 'Lights out! Keep singing!' : on('mute') ? 'Music muted! Keep going a cappella!' : on('fog') ? 'Fog machine! Sing it from memory!'
        : on('speed') ? 'Sped up! Keep up!' : on('slow') ? 'Slow-mo! Hold those notes!' : disco ? 'Disco fever! Stay focused!' : on('echo') ? 'Everyone hears you echo. Own it!'
        : on('mirror') ? 'Mirror mode! Read it backwards!' : on('quake') ? 'Earthquake! Hold on!' : on('shrink') ? 'Tiny lyrics! Squint!' : on('bubbles') ? 'Bubbles! Sing through them!'
        : on('robot') ? 'Everyone hears a robot. Beep boop!' : on('megaphone') ? 'You sound like a megaphone!'
        : r.boost?.double ? 'Double Up is on. Make it count!' : 'Sing along with the video!';
    }
  }
  if (r.phase === 'announce' && iSing()) {
    const lvl = readMicLevel();
    $('#micLevel').style.width = `${lvl * 100}%`;
    $('#micTxt').textContent = S.voiceState !== 'on' ? 'No mic' : voice.isMuted() ? 'Muted!' : lvl > 0.08 ? 'Sounds good!' : 'Say something';
  }
  if (r.phase === 'draw') updateDraw();
  if (r.phase === 'pick') {
    const P = r.pick;
    const left = clamp((r.phaseEndsAt - net.now()) / (P?.chosen >= 0 ? 1900 : 9000), 0, 1);
    $('#pickTimer').style.transform = `scaleX(${left})`;
  }
  updateHandReady();
  if (r.phase === 'announce' && iSing()) {
    // Five seconds to hit I'M READY, then the server readies you anyway
    const left = r.singerReady ? 0 : clamp((r.readyBy - now) / 5000, 0, 1);
    $('#readyFill').style.transform = `scaleX(${left})`;
    $('#readyT').textContent = Math.ceil(left * 5) || '';
    if (r.singerReady && !$('#singReady').disabled) $('#singReady').disabled = true;
  }
  if (r.phase === 'roundEnd') $('#reTimer').style.transform = `scaleX(${clamp((r.phaseEndsAt - now) / 6500, 0, 1)})`;
  if (r.phase === 'vote') $('#voteTimer').style.transform = `scaleX(${clamp((r.phaseEndsAt - now) / 12000, 0, 1)})`;
  if (r.phase === 'verdict' && r.verdict) runVerdict();
}

function runVerdict() {
  const r = S.room, V = r.verdict, t = (performance.now() - S.phaseT0) / 1000;
  const at = (i) => 1.2 + i * 0.8;
  while (S.verdict.shown < V.order.length && t > at(S.verdict.shown)) {
    const id = V.order[S.verdict.shown++];
    scene.raiseCard(id, V.votes[id]);
    sfx.card(V.votes[id]);
  }
  if (!S.verdict.scored && t > at(V.order.length) + 0.6) {
    S.verdict.scored = true;
    scene.lowerCards();
    scene.setShot('score');
    scene.setFocus(true);
    const col = V.pts >= 70 ? 'var(--mint)' : V.pts >= 50 ? 'var(--mustard-d)' : 'var(--tomato)';
    $('#verdict').style.setProperty('--c', col);
    $('#vdNum').innerHTML = `${V.base ?? V.pts}<span>/100</span>${V.mult > 1 ? `<em>x${V.mult}</em>` : ''}`;
    $('#vdLabel').textContent = V.pts >= 80 ? 'STANDING OVATION!' : V.pts >= 60 ? 'NOT BAD AT ALL!' : V.pts >= 45 ? 'THE CROWD IS… POLITE' : 'OUCH. TOMATO TIME.';
    $('#vdExtras').innerHTML = '';
    $('#verdict').classList.add('show');
    renderScoreboard();
    bump(r.singerId, `+${V.pts}`);
    V.bonus.forEach((id) => bump(id, '+10'));
    if (iSing()) {
      S.stats.songs++;
      S.stats.best = Math.max(S.stats.best, V.pts);
      save('offkey.stats', S.stats);
      renderLook();
    }
    // Then the singer's points cards from the Lucky Draw land on top
    if (V.extras?.length) setTimeout(() => {
      if (S.room?.phase !== 'verdict' || S.room.turn !== r.turn) return;
      S.verdict.extrasShown = true;
      $('#vdExtras').innerHTML = V.extras.map((x, i) => `<span class="vx ${cardClass(x.kind)}" style="animation-delay:${i * 0.25}s">${ic(POWERS[x.kind].icon)}<b>${x.pts > 0 ? '+' : ''}${x.pts}</b><small>${POWERS[x.kind].name}${x.victim ? ` from ${esc(x.victim === S.me.id ? 'you' : nameOf(x.victim))}` : ''}</small></span>`).join('');
      renderScoreboard();
      const sum = V.extras.reduce((s, x) => s + x.pts, 0);
      bump(r.singerId, `${sum >= 0 ? '+' : ''}${sum}`);
      V.extras.filter((x) => x.victim).forEach((x) => bump(x.victim, `-${x.pts}`));
      if (V.extras.some((x) => x.kind === 'jackpot')) { sfx.fanfare(); scene.confetti(2.5, -2.75); } else if (sum < 0) sfx.bad(); else sfx.win();
      const extraTxt = V.extras.map((x) => `${x.pts > 0 ? '+' : ''}${x.pts} ${POWERS[x.kind].name}`).join(' · ');
      caption(`${iSing() ? 'Your' : `${esc(nameOf(r.singerId))}’s`} cards: <span class="y">${extraTxt}</span>`);
    }, 1700);
    if (V.pts >= 60) { scene.setMood(r.singerId, 'happy'); scene.jump(r.singerId, 2); scene.confetti(3, -2.75); sfx.cheer(); }
    else { scene.setMood(r.singerId, 'sad'); sfx.aww(); }
    const who = iSing() ? 'You get' : `${esc(nameOf(r.singerId))} gets`;
    const next = r.upNext?.[0];
    caption(`${who} <span class="y">+${V.pts}</span>${V.mult > 1 ? ' with Double Up' : ''}${V.bonus.length ? ' · good judges <span class="y">+10</span>' : ''}${next ? ` · Next up: <span class="y">${esc(next === S.me.id ? 'You!' : nameOf(next))}</span>` : ''}`);
  }
}

/* Reactions and tomatoes */
const fx = $('#fx');
let ownEchoes = 0;
function onReact(m) {
  S.hype = m.hype;
  S.hypeAt = net.now();
  if (S.screen !== 'game') return;
  if (m.from === S.me.id && m.local !== true && ownEchoes > 0) { ownEchoes--; return; }
  const from = scene.screenOf(m.from, 0.1) || { x: rand(0.15, 0.85) * innerWidth, y: innerHeight - 160 };
  if (m.from === S.me.id || Math.random() < 0.4) sfx[m.kind === 'tomato' ? 'throw' : m.kind]?.();
  if (Math.random() < 0.25) scene.jump(m.from, 1);
  if (m.kind === 'tomato') { throwTomato(from); return; }
  const el = document.createElement('div');
  el.className = 'float';
  el.textContent = RX[m.kind];
  fx.appendChild(el);
  const rise = rand(150, 240), dx = rand(-40, 40);
  el.animate([
    { transform: `translate(${from.x - 18}px,${from.y - 20}px) scale(.3)`, opacity: 0 },
    { transform: `translate(${from.x - 18 + dx * 0.3}px,${from.y - 50}px) scale(1.2)`, opacity: 1, offset: 0.15 },
    { transform: `translate(${from.x - 18 + dx}px,${from.y - 20 - rise}px) scale(.9)`, opacity: 0 },
  ], { duration: rand(1500, 2100), easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => el.remove();
}
function throwTomato(from) {
  const r = S.room;
  const head = scene.screenOf(r.singerId, -0.35);
  if (!head) return;
  head.x += rand(-30, 30);
  const el = document.createElement('div');
  el.className = 'tomato-fly';
  el.textContent = '🍅';
  fx.appendChild(el);
  const peak = Math.min(from.y, head.y) - rand(120, 200);
  const frames = [];
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const x = from.x + (head.x - from.x) * k;
    const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * peak + k * k * head.y;
    frames.push({ transform: `translate(${x - 22}px,${y - 22}px) rotate(${k * 600}deg) scale(${1.15 - k * 0.35})` });
  }
  el.animate(frames, { duration: 600, easing: 'linear' }).onfinish = () => {
    el.remove();
    splat2d(head.x, head.y);
    scene.hit(r.singerId);
    scene.splatNear(r.singerId);
    scene.shake();
    sfx.splat();
  };
}
function splat2d(x, y) {
  const el = document.createElement('div');
  el.className = 'splat';
  el.innerHTML = '<svg viewBox="0 0 120 120"><path fill="#e0301e" d="M60 30c8-14 18 2 14 10 12-6 22 6 12 14 14 2 12 18 0 18 8 10-4 20-12 12 0 14-16 14-18 2-6 12-22 8-16-6-14 4-20-10-8-16-12-6-6-22 8-16-4-12 12-20 20-18z"/><circle cx="24" cy="38" r="5" fill="#e0301e"/><circle cx="98" cy="88" r="4" fill="#e0301e"/></svg>';
  fx.appendChild(el);
  el.animate([
    { transform: `translate(${x}px,${y}px) scale(.2)`, opacity: 1 },
    { transform: `translate(${x}px,${y}px) scale(1.1) rotate(18deg)`, opacity: 1, offset: 0.2 },
    { transform: `translate(${x}px,${y + 30}px) scale(1) rotate(22deg)`, opacity: 0 },
  ], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => el.remove();
}

function react(kind, btn) {
  if (!S.room || S.room.phase !== 'sing' || iSing()) return;
  if (btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 120); }
  net.send({ t: 'react', kind });
  // Our own reaction shows instantly; the server's echo of it is skipped
  ownEchoes++;
  onReact({ from: S.me.id, kind, hype: S.hype, local: true });
}
const VB = [['smiley-x-eyes', '#ff4d3d', '#c3271a'], ['smiley-sad', '#ff8c42', '#cc5e1c'], ['smiley-meh', '#f2b322', '#c98400'], ['smiley', '#61c94a', '#3b9a2a'], ['smiley-wink', '#25d39b', '#0e9268']];
$('#vbtns').innerHTML = VB.map(([f, c, cd], i) => `<button class="vb" data-v="${i + 1}" style="--c:${c};--cd:${cd}">${ic(f)}<b>${i + 1}</b></button>`).join('');
function castVote(v) {
  if (!S.room || S.room.phase !== 'vote' || iSing() || S.myVote) return;
  S.myVote = v;
  $$('.vb').forEach((b) => b.classList.toggle('sel', +b.dataset.v === v));
  $('#vbtns').classList.add('done');
  sfx.pop(500 + v * 120);
  net.send({ t: 'vote', v });
}
$$('.vb').forEach((b) => b.addEventListener('click', () => castVote(+b.dataset.v)));
$$('.rx').forEach((b) => b.addEventListener('click', () => react(b.dataset.rx, b)));
$('#singReady').addEventListener('click', () => { $('#singReady').disabled = true; sfx.click(); net.send({ t: 'singerReady' }); });

/* =====================================================================
   How to play: four short pages; the card list is built from the real deck
   ===================================================================== */
function openHow() {
  if (!$('#howCards').childElementCount) {
    const GROUPS = [
      ['sab', 'k-sab', 'SABOTAGE', TOUCH ? 'Tap one while someone else is singing.' : 'You play these with <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> or a click, while someone else sings.'],
      ['self vote', 'k-self', 'AUTOMATIC', 'Nothing to press. They switch on by themselves on your next song or vote.'],
      ['instant', 'k-good', 'POINTS', 'Secret until your next song, then they land on its score. Not all of them are good.'],
    ];
    $('#howCards').innerHTML = GROUPS.map(([types, cls, name, line]) => {
      const cards = Object.entries(POWERS).filter(([, p]) => types.split(' ').includes(p.type));
      return `<div class="hg"><div class="hg-head ${cls}"><span class="cf-tag">${name}</span><p>${line}</p><em>${cards.length} cards</em></div>
        <div class="hg-grid">${cards.map(([k, p]) => `<div class="hc ${cardClass(k)}"><span class="cf-ic">${ic(p.icon)}</span><span><b>${p.name}</b><small>${esc(p.line)}</small></span></div>`).join('')}</div></div>`;
    }).join('');
  }
  $('#m-how').classList.add('open');
}
$('#howNav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sec]');
  if (!b) return;
  sfx.pop(560);
  $$('#howNav button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.how-page').forEach((p) => p.classList.toggle('on', p.dataset.sec === b.dataset.sec));
});

/* =====================================================================
   Song pick: three songs, the crowd votes, the singer sings the winner
   ===================================================================== */
/** "Artist - Song" into its two halves (titles without a dash are all song), minus any "(karaoke)" tag. */
function splitTitle(title) {
  const clean = title.replace(/\s*[([][^)\]]*(karaoke|קריוקי)[^)\]]*[)\]]/gi, '').replace(/\s*[|｜].*(karaoke|קריוקי|version).*$/i, '').trim();
  const m = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1], song: m[2] } : { artist: '', song: clean };
}
function renderPick() {
  const r = S.room, P = r.pick;
  if (!P) return;
  const sp = player(r.singerId);
  const decided = P.chosen >= 0;
  const crowd = crowdIds();
  const voted = Object.keys(P.votes).filter((id) => crowd.includes(id));
  $('#pickWho').innerHTML = `${avatar(sp?.look || '#888')}<span><small>Singing next</small><b>${esc(iSing() ? 'YOU' : sp?.name || '?')}</b></span>`;
  $('#pickTitle').textContent = decided ? 'THE ROOM HAS SPOKEN!' : iSing() ? 'THE ROOM PICKS YOUR SONG' : `PICK ${(sp?.name || '?').toUpperCase()}’S SONG`;
  $('#pickSub').textContent = decided ? 'Here it comes…' : iSing() ? 'No take-backs: whatever wins, you sing.' : P.votes[S.me.id] != null ? 'Locked in. You can still switch.' : 'Most votes wins. A tie goes to a coin flip.';
  // Rebuild the cards once per turn; votes and the result are just classes and widths after that
  const key = `${r.turn}|${P.options.map((o) => o.videoId).join(',')}`;
  if (S.pickKey !== key) {
    S.pickKey = key;
    $('#pickCards').innerHTML = P.options.map((o, i) => {
      const t = splitTitle(o.title);
      return `
      <button class="pk" data-i="${i}" style="animation-delay:${0.07 * i}s" ${iSing() ? 'disabled' : ''}>
        <span class="pk-art"><img src="https://i.ytimg.com/vi/${o.videoId}/mqdefault.jpg" alt=""><kbd>${i + 1}</kbd><span class="pk-mine">${ic('check-fat')}YOUR PICK</span><span class="pk-won">${ic('crown-simple')}PICKED</span></span>
        <span class="pk-meta"><b dir="auto">${esc(t.song)}</b><small dir="auto">${esc(t.artist || o.channel || '')}</small></span>
        <span class="pk-foot"><span class="pk-votes"></span><span class="pk-n">0</span></span>
        <span class="pk-bar"><i></i></span>
      </button>`;
    }).join('');
    $('#pickVoters').innerHTML = crowd.map((id) => `<span class="vt" data-id="${id}" title="${esc(nameOf(id))}">${avatar(player(id)?.look || '#888')}<i class="ph-bold ph-check"></i></span>`).join('');
  }
  $$('#pickCards .pk').forEach((b) => {
    const i = +b.dataset.i;
    const ids = Object.entries(P.votes).filter(([, v]) => v === i).map(([id]) => id);
    const box = $('.pk-votes', b);
    if (box.dataset.ids !== ids.join(',')) {
      box.innerHTML = ids.map((id) => avatar(player(id)?.look || '#888')).join('') || '<em>No votes yet</em>';
      box.dataset.ids = ids.join(',');
    }
    $('.pk-n', b).textContent = ids.length;
    $('.pk-bar i', b).style.transform = `scaleX(${crowd.length ? ids.length / crowd.length : 0})`;
    b.classList.toggle('has', ids.length > 0);
    b.classList.toggle('mine', P.votes[S.me.id] === i);
    b.classList.toggle('won', decided && P.chosen === i);
    b.classList.toggle('lost', decided && P.chosen !== i);
  });
  $$('#pickVoters .vt').forEach((a) => a.classList.toggle('done', voted.includes(a.dataset.id)));
  $('#pickCount').textContent = decided ? `${voted.length} of ${crowd.length} voted` : voted.length === crowd.length ? 'Everyone voted!' : `${voted.length} of ${crowd.length} voted`;
  if (decided && S.pickWon !== P.chosen) {
    S.pickWon = P.chosen;
    sfx.ding();
    scene.jump(r.singerId, 2);
    caption(`${iSing() ? 'You’re' : `<span class="y">${esc(sp?.name)}</span> is`} singing <span class="y">${esc(P.options[P.chosen].title)}</span>`);
  }
}
function pickSong(i) {
  const r = S.room;
  if (!r || r.phase !== 'pick' || iSing() || !r.pick || r.pick.chosen >= 0 || i >= r.pick.options.length) return;
  sfx.pop(560 + i * 90);
  // Show the vote straight away; the server's copy follows a moment later
  r.pick.votes[S.me.id] = i;
  renderPick();
  net.send({ t: 'pickSong', i });
}
$('#pickCards').addEventListener('click', (e) => { const b = e.target.closest('.pk'); if (b) pickSong(+b.dataset.i); });

/* =====================================================================
   Power-ups: the Lucky Draw, your hand of cards, and what they do
   ===================================================================== */
const cardClass = (kind) => { const p = POWERS[kind]; return !p ? 'k-secret' : p.type === 'instant' ? `k-${p.tier}` : `k-${p.type}`; };
const cardFace = (kind) => {
  const p = POWERS[kind];
  return `<span class="cf-ic">${ic(p.icon)}</span><b>${p.name}</b><small>${esc(p.line)}</small><span class="cf-tag">${USE_TEXT[p.type]}</span>`;
};
function bump(id, txt) {
  const el = $(`.sb[data-id="${id}"] .bump`);
  if (!el) return;
  el.textContent = txt;
  el.classList.toggle('neg', txt.startsWith('-'));
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}

/* The Lucky Draw: a slot-machine reel per player, stopping one by one on the shared clock */
const REEL_ITEM = 92;
const REEL_SPIN = 22;
function setupDraw() {
  const r = S.room, D = r.draw;
  if (!D) return;
  const kinds = Object.keys(POWERS);
  $('#drawTitle').textContent = `ROUND ${D.round + 1} OF ${r.settings.rounds}`;
  $('#drawRow').innerHTML = D.results.map((res, i) => {
    const p = player(res.id);
    // Someone else's kept card is a secret: their reel lands on a face-down card
    const strip = [...Array(REEL_SPIN)].map(() => pick(kinds)).concat(res.kind)
      .map((k) => `<div class="ds-item ${cardClass(k)}">${ic(POWERS[k]?.icon || 'seal-question')}</div>`).join('');
    const face = res.kind ? cardFace(res.kind)
      : `<b>SECRET CARD</b><small>Only ${esc(p?.name || 'they')} knows what it is.</small><span class="cf-tag">IN THEIR HAND</span>`;
    return `<div class="dslot ${res.id === S.me.id ? 'me' : ''}" data-id="${res.id}" style="animation-delay:${0.08 * i}s">
      <div class="ds-who">${avatar(p?.look || '#888')}<span>${esc(res.id === S.me.id ? 'You' : p?.name || '?')}</span></div>
      <div class="ds-reel"><div class="ds-strip">${strip}</div></div>
      <div class="ds-card ${cardClass(res.kind)}">${face}${res.dropped ? `<em>Hand full: ${POWERS[res.dropped].name} discarded</em>` : ''}</div>
    </div>`;
  }).join('');
  const first = r.upNext?.[0];
  // The whole round's running order, so it's clear everyone takes the stage before the next draw
  const line = r.lineup?.length ? r.lineup : first ? [first] : [];
  $('#drawNext').innerHTML = line.length ? `<span class="dn-label">${ic('microphone-stage')}THIS ROUND</span>${line.map((id, i) => `<span class="dn-p ${i === 0 ? 'first' : ''}"><em>${i + 1}</em>${avatar(player(id)?.look || '#888')}<b>${esc(id === S.me.id ? 'You' : nameOf(id))}</b></span>`).join('<i class="ph-bold ph-caret-right dn-arr"></i>')}` : '';
  const slots = $$('#drawRow .dslot');
  S.reels = D.results.map((res, i) => ({ res, el: slots[i], strip: $('.ds-strip', slots[i]), idx: -1, done: false }));
  // Reels that stopped before we arrived (a reload mid-draw) just show their card
  const t = net.now();
  S.reels.forEach((reel) => { if (t >= reel.res.revealAt) revealReel(reel, true); });
}
function updateDraw() {
  const D = S.room.draw;
  if (!D || !S.reels) return;
  const t = net.now();
  const start = D.startAt + 500;
  for (const reel of S.reels) {
    if (reel.done) continue;
    const end = reel.res.revealAt;
    const k = clamp((t - start) / (end - start), 0, 1);
    const off = (1 - Math.pow(1 - k, 3.2)) * REEL_SPIN * REEL_ITEM;
    // Motion blur while it's flying, crisp as it settles
    const speed = 3.2 * Math.pow(1 - k, 2.2) * REEL_SPIN;
    reel.strip.style.transform = `translateY(${-off}px)`;
    reel.strip.style.filter = speed > 4 ? `blur(${Math.min(4, speed / 6).toFixed(1)}px)` : '';
    const idx = Math.round(off / REEL_ITEM);
    if (idx !== reel.idx) { reel.idx = idx; if (reel.res.id === S.me.id && k > 0) sfx.reel(); }
    if (t >= end) revealReel(reel, false);
  }
}
function revealReel(reel, quiet) {
  reel.done = true;
  reel.strip.style.transform = `translateY(${-REEL_SPIN * REEL_ITEM}px)`;
  reel.strip.style.filter = '';
  const { res } = reel;
  const spec = POWERS[res.kind];
  reel.el.classList.add('revealed', cardClass(res.kind));
  renderScoreboard();
  if (quiet) return;
  if (res.delta) bump(res.id, `${res.delta > 0 ? '+' : ''}${res.delta}`);
  if (res.victim) bump(res.victim, `-${res.delta}`);
  if (!spec) { sfx.card(2); return; }
  if (spec.tier === 'gold') { sfx.fanfare(); scene.confetti(2.5); scene.jump(res.id, 3); }
  else if (spec.tier === 'bad') { sfx.bad(); scene.setMood(res.id, 'sad'); }
  else { sfx.win(); scene.jump(res.id, 1); }
}

/* Between rounds: the standings, and what each player made this round */
function renderRoundEnd() {
  const r = S.room;
  const done = (r.roundDone ?? 0) + 1;
  const last = done >= r.settings.rounds;
  $('#reTitle').textContent = `ROUND ${done} OF ${r.settings.rounds} DONE!`;
  $('#reSub').textContent = 'Everyone has sung. Here\u2019s where it stands.';
  const ranked = [...r.players].filter((p) => p.connected || p.bot).sort((a, b) => b.score - a.score);
  $('#reBoard').innerHTML = ranked.map((p, i) => {
    const gain = p.score - (S.roundBase?.get(p.id) ?? p.score);
    return `<li class="${p.id === S.me.id ? 'me' : ''}" style="animation-delay:${0.15 + i * 0.08}s"><span class="rk">${i + 1}</span>${avatar(p.look || '#888')}<b>${esc(p.id === S.me.id ? 'You' : p.name)}${i === 0 && p.score > 0 ? ic('crown-simple') : ''}</b><span class="gain ${gain ? '' : 'zero'}">${gain >= 0 ? '+' : ''}${gain} this round</span><span class="sc">${p.score}</span></li>`;
  }).join('');
  const first = r.upNext?.[0];
  $('#reNext').innerHTML = last ? '' : `${ic(r.settings.powers === 'draw' ? 'clover' : 'microphone-stage')}<span>Round ${done + 1}: ${r.settings.powers === 'draw' ? 'new cards, then' : ''} ${first === S.me.id ? '<b>you</b> sing' : `<b>${esc(nameOf(first))}</b> sings`} first</span>`;
  S.roundBase = new Map(r.players.map((p) => [p.id, p.score]));
}

/* Crowd missions: one secret job per song for everyone who isn't singing */
function renderMission() {
  const r = S.room, m = r?.mission, spec = m && MISSIONS[m.kind];
  // The vote mission stays up through the vote; the rest are about the song itself
  const phases = m?.kind === 'psychic' ? ['announce', 'sing', 'vote', 'verdict'] : ['announce', 'sing', 'vote'];
  const show = !!spec && S.screen === 'game' && !iSing() && phases.includes(r.phase);
  const el = $('#mission');
  el.classList.toggle('show', show);
  if (!show) return;
  const key = `${r.turn}|${m.kind}`;
  if (el.dataset.key !== key) {
    el.dataset.key = key;
    $('#msIcon').innerHTML = ic(spec.icon);
    $('#msName').textContent = spec.name;
    $('#msLine').textContent = m.kind === 'mix' && m.goal === 3 ? 'Use every reaction at least once.' : spec.line;
    $('#msPts').textContent = `+${spec.pts}`;
  }
  $('#msFill').style.transform = `scaleX(${m.goal ? m.n / m.goal : 0})`;
  $('#msKicker').textContent = m.done ? 'MISSION COMPLETE' : m.failed ? 'MISSION MISSED' : m.goal > 1 ? `SECRET MISSION · ${m.n}/${m.goal}` : 'SECRET MISSION';
  $('#msStamp').innerHTML = m.done ? `${ic('check-fat')}DONE` : m.failed ? 'MISSED' : '';
  el.classList.toggle('done', m.done);
  el.classList.toggle('failed', !m.done && m.failed);
}
function onMission(m) {
  if (S.screen !== 'game') return;
  const spec = MISSIONS[m.kind];
  bump(m.id, `+${m.pts}`);
  if (m.id === S.me.id) {
    sfx.win();
    scene.jump(m.id, 2);
    const el = $('#mission');
    el.classList.remove('win'); void el.offsetWidth; el.classList.add('win');
    return;
  }
  toast(m.id, `<b>${esc(nameOf(m.id))}</b> nailed <b>${spec?.name || 'a mission'}</b> +${m.pts}`, 'target');
  $('#toasts').lastElementChild?.classList.add('mission-toast');
}

/* Your hand: up to three cards, bottom right. A card glows when it can be played right now. */
const USE_HINT = { sab: 'Play it while someone else is singing.', self: 'No need to play it: it switches on by itself on your next song.', vote: 'No need to play it: it switches on by itself when you next vote.' };
function cardUsable(kind) {
  const r = S.room, p = POWERS[kind], t = net.now();
  if (!r) return false;
  if (p.type === 'sab') return r.phase === 'sing' && !iSing() && t > r.startAt + 1500 && t < r.endAt - Math.min(6000, r.clip * 250) && !r.sabs.some((x) => x.until > t);
  return false;
}
function renderHand() {
  const r = S.room;
  const me = meInRoom();
  // Sabotage cards you play, plus boosts waiting to switch on by themselves
  const auto = Object.entries(me?.buffs || {}).flatMap(([kind, n]) => Array.from({ length: n }, (_, i) => ({ id: `auto-${kind}-${i}`, kind, auto: true })));
  const hand = (r && r.settings.powers !== 'off' && me ? [...(me.hand || []), ...auto] : []);
  const show = S.screen === 'game' && ['announce', 'sing', 'vote', 'verdict'].includes(r?.phase) && hand.length > 0;
  $('#hand').classList.toggle('show', show);
  // The key carries each card's kind too, so the hand can never show a stale card
  const key = `${r?.code}|${hand.map((c) => `${c.id}:${c.kind}`).join(',')}`;
  if ($('#hand').dataset.key === key) return;
  $('#hand').dataset.key = key;
  let slot = 0;
  $('#handCards').innerHTML = hand.map((c, i) => `<button class="pw ${cardClass(c.kind)} ${c.auto ? 'auto' : 'play'}" data-card="${c.id}" data-kind="${c.kind}" style="--i:${i - (hand.length - 1) / 2}" title="${POWERS[c.kind].name}: ${esc(POWERS[c.kind].line)}">${cardFace(c.kind)}${c.auto ? '' : `<kbd>${'QWE'[slot++] || ''}</kbd>`}</button>`).join('');
}
function updateHandReady() { $$('#handCards .pw').forEach((b) => b.classList.toggle('ready', cardUsable(b.dataset.kind))); }
/** After a refused play, put the card back. */
function resetHand() { if ($('#handCards .pw.gone')) { $('#hand').dataset.key = ''; renderHand(); } }
function playCard(btn) {
  if (!btn || btn.classList.contains('gone')) return;
  const kind = btn.dataset.kind;
  if (btn.classList.contains('auto')) { notify(USE_HINT[POWERS[kind].type], '', 2600); return; }
  if (!cardUsable(kind)) {
    notify(USE_HINT[POWERS[kind].type], '', 2400);
    btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope');
    return;
  }
  btn.classList.add('gone');
  net.send({ t: 'power', card: Number(btn.dataset.card) });
}
$('#handCards').addEventListener('click', (e) => playCard(e.target.closest('.pw')));

/** Someone played a card: tell everyone, and kick off the one-shot effects. */
function onPower(m) {
  if (S.screen !== 'game') return;
  const spec = POWERS[m.kind];
  const who = m.by === S.me.id ? 'You' : nameOf(m.by);
  const target = m.target === S.me.id ? 'you' : nameOf(m.target);
  scene.jump(m.by, 1);
  if (m.blocked) {
    toast(m.target, `<b>BODYGUARD!</b> ${esc(who)} tried ${spec.name} on ${esc(target)}. Blocked.`, 'shield-check');
    sfx.shield();
    return;
  }
  const whose = m.by === S.me.id ? 'Your' : `${nameOf(m.by)}’s`;
  const text = {
    double: `<b>${esc(whose)} DOUBLE UP</b> kicks in. This song scores double!`,
    shield: `<b>${esc(whose)} BODYGUARD</b> is on duty. Sabotage won’t work.`,
    golden: `<b>${esc(whose)} GOLDEN VOTE</b> counts triple!`,
  }[m.kind] || `<b>${esc(who)}</b> played <b>${spec.name}</b>`;
  toast(m.by, text, spec.icon);
  (sfx[m.kind] || sfx.win)();
  if (m.kind === 'bonk' && m.at) {
    const spec = POWERS.bonk;
    const delay = Math.max(0, (m.at - net.now()) / 1000);
    scene.bonk(m.by, m.target, delay, spec.hit / 1000, (spec.ms - spec.hit) / 1000);
    setTimeout(() => {
      if (S.room?.phase !== 'sing') return;
      sfx.bonk();
      const head = scene.screenOf(m.target, -0.1);
      if (head) comicPop('BONK!', head.x, head.y);
    }, (delay * 1000) + spec.hit);
  }
  if (m.kind === 'storm') {
    const crowd = crowdIds();
    for (let i = 0; i < 8; i++) setTimeout(() => {
      if (S.room?.phase !== 'sing') return;
      throwTomato(scene.screenOf(pick(crowd), 0.1) || { x: rand(0.2, 0.8) * innerWidth, y: innerHeight - 140 });
    }, 250 + i * 140);
  }
}
/** A big comic-book word that pops over the stage (BONK!). */
function comicPop(word, x, y) {
  const el = document.createElement('div');
  el.className = 'comic';
  el.textContent = word;
  fx.appendChild(el);
  el.animate([
    { transform: `translate(${x}px,${y}px) translate(-50%,-100%) scale(.2) rotate(-14deg)`, opacity: 0 },
    { transform: `translate(${x}px,${y}px) translate(-50%,-100%) scale(1.25) rotate(-8deg)`, opacity: 1, offset: 0.18 },
    { transform: `translate(${x}px,${y}px) translate(-50%,-100%) scale(1) rotate(-8deg)`, opacity: 1, offset: 0.7 },
    { transform: `translate(${x}px,${y - 40}px) translate(-50%,-100%) scale(.9) rotate(-8deg)`, opacity: 0 },
  ], { duration: 1300, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => el.remove();
}
function clearEffects() {
  $('#s-game').classList.remove('fx-lights', 'fx-fog', 'fx-mirror', 'fx-quake', 'fx-shrink', 'fx-bubbles');
  scene.setDisco(false);
  if (S.voiceFx) { S.voiceFx = null; voice.setVoiceFx(null); }
}

/* =====================================================================
   Final
   ===================================================================== */
function renderFinal(entering) {
  const r = S.room;
  if (!r) return;
  const ranked = [...r.players].sort((a, b) => b.score - a.score);
  const AWARDS = [['star', 'Star of the night'], ['hand-heart', 'Crowd pleaser'], ['microphone', 'Solid voice'], ['heart', 'Brave soul'], ['heart', 'Brave soul'], ['heart', 'Brave soul']];
  const award = (i) => (i > 0 && i === ranked.length - 1 && ranked.length > 2 ? ['hand-fist', 'Tomato magnet'] : AWARDS[i]);
  // Winner in the middle, the rest alternating out to the sides
  const order = [];
  ranked.forEach((p, i) => (i % 2 ? order.unshift([p, i]) : order.push([p, i])));
  const html = order.map(([p, i]) => `
    <div class="res r${i + 1} ${p.id === S.me.id ? 'me' : ''}" style="animation-delay:${0.2 + i * 0.1}s">
      ${i === 0 ? `<i class="ph-fill ph-crown crown"></i>` : ''}<span class="rk">${i + 1}</span>${avatar(p.look)}
      <div class="nm">${esc(p.id === S.me.id ? 'You' : p.name)}</div><div class="aw">${ic(award(i)[0])}${award(i)[1]}</div>
      <div class="pt">${p.score}<small>pts</small></div></div>`).join('');
  // Rebuild only when something changed, so the cards don't replay their entrance on every update
  if ($('#results').dataset.key !== html) { $('#results').innerHTML = html; $('#results').dataset.key = html; }
  $('#againBtn').hidden = !isHost();
  $('#againHint').hidden = isHost();
  if (entering) {
    karaoke.stop();
    voice.setMode('chat');
    voice.setCrowd(new Map());
    scene.clearSplats();
    scene.resetMoods();
    scene.setLights(1);
    scene.setFocus(false);
    scene.setLayout('final', { ranked: ranked.map((p) => p.id) });
    scene.setShot('final');
    setTimeout(() => { if (S.screen === 'final') { scene.jump(ranked[0].id, 4); scene.confetti(8); sfx.fanfare(); } }, 700);
  }
}

/* =====================================================================
   Pack library
   ===================================================================== */
const HEBREW = /[\u0590-\u05FF]/;
let libFilter = 'all';
function libFilters() {
  const inLobby = S.room && S.room.phase === 'lobby';
  const sel = new Set(S.room?.settings.packIds || []);
  const count = (f) => S.packs.filter(f).length;
  const all = [
    ['all', 'squares-four', 'All packs', count(() => true)],
    inLobby && ['game', 'check-circle', 'In this game', count((p) => sel.has(p.id))],
    ['mine', 'user', 'Made by you', count((p) => p.author === S.me.name)],
    ['hebrew', 'translate', 'Hebrew', count((p) => HEBREW.test(p.name + p.songs.map((s) => s.title).join('')))],
    ['english', 'globe-hemisphere-west', 'English', count((p) => !HEBREW.test(p.name + p.songs.map((s) => s.title).join('')))],
  ].filter(Boolean);
  if (!all.some(([k]) => k === libFilter)) libFilter = 'all';
  $('#libFilters').innerHTML = all.map(([k, icon, label, n]) => `<button class="lib-chip ${k === libFilter ? 'on' : ''}" data-f="${k}">${ic(icon)}${label}<span class="n">${n}</span></button>`).join('');
  $$('#libFilters [data-f]').forEach((b) => b.addEventListener('click', () => { libFilter = b.dataset.f; sfx.click(); renderLibrary(); }));
}
function renderLibrary() {
  libFilters();
  const q = $('#libSearch').value.trim().toLowerCase();
  const sel = new Set(S.room?.settings.packIds || []);
  const canAdd = S.room && S.room.phase === 'lobby' && isHost();
  const match = (p) => !q || p.name.toLowerCase().includes(q) || p.songs.some((s) => `${s.title} ${s.channel}`.toLowerCase().includes(q));
  const byFilter = {
    all: () => true,
    game: (p) => sel.has(p.id),
    mine: (p) => p.author === S.me.name,
    hebrew: (p) => HEBREW.test(p.name + p.songs.map((s) => s.title).join('')),
    english: (p) => !HEBREW.test(p.name + p.songs.map((s) => s.title).join('')),
  }[libFilter];
  const list = S.packs.filter((p) => byFilter(p) && match(p));
  $('#libCount').innerHTML = `<b>${list.length}</b> of ${S.packs.length} pack${S.packs.length === 1 ? '' : 's'}`;
  const faces = ['#ff7aa2', '#3d8bff', '#ffc22e'].map((c) => avatar(c)).join('');
  const createCard = `<div class="pcard new" data-new><span class="faces">${faces}</span><div class="ttl">CREATE MY PACK</div><p>Paste YouTube karaoke links and build your own setlist.</p><span class="plus">${ic('plus')}</span></div>`;
  $('#libGrid').innerHTML = createCard + list.map((p) => {
    const inGame = sel.has(p.id);
    const action = canAdd
      ? inGame ? `<button class="act added" data-toggle="${p.id}">${ic('check-circle')}IN THE GAME</button>` : `<button class="act add" data-toggle="${p.id}">${ic('plus-circle')}ADD TO GAME</button>`
      : `<button class="act open" data-open="${p.id}">${ic('play')}OPEN</button>`;
    return `
      <div class="pcard" data-pack="${p.id}" style="--c:${p.color}">
        <div class="art">${cover(p)}</div>
        <span class="num">${ic(p.icon || 'microphone-stage')}</span>
        <span class="edit-ic" title="Edit">${ic('pencil-simple')}</span>
        <div class="ttl">${esc(p.name)}</div>
        <div class="by">${ic('user-circle')}${esc(p.author || 'Someone')}</div>
        <div class="stats"><span>${ic('music-notes')}${p.songs.length} songs</span><span>${ic('youtube-logo')}${esc([...new Set(p.songs.map((s) => s.channel))].slice(0, 2).join(', ') || 'YouTube')}</span></div>
        ${action}
      </div>`;
  }).join('') + (list.length ? '' : libFilter === 'mine' && !q
    ? `<div class="lib-empty"><span class="em-ic">${ic('music-notes-plus')}</span><b>No packs of yours yet</b>Make one with the songs your friends love. It takes a minute.</div>`
    : `<div class="lib-empty"><span class="em-ic">${ic('magnifying-glass')}</span><b>Nothing here</b>Try another search or another filter.</div>`);
  $('#libGrid [data-new]').addEventListener('click', () => { sfx.click(); openEditor(null); });
  $$('#libGrid .pcard[data-pack]').forEach((card) => card.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      e.stopPropagation();
      const ids = new Set(S.room.settings.packIds);
      ids.has(t.dataset.toggle) ? ids.delete(t.dataset.toggle) : ids.add(t.dataset.toggle);
      S.room.settings.packIds = [...ids];
      net.send({ t: 'settings', patch: { packIds: [...ids] } });
      sfx.pop(ids.has(t.dataset.toggle) ? 760 : 520);
      renderLibrary();
      renderLobby(false);
      return;
    }
    sfx.click();
    openEditor(S.packs.find((p) => p.id === card.dataset.pack));
  }));
}
function openLibrary() {
  $('#libSearch').value = '';
  renderLibrary();
  $('#m-library').classList.add('open');
}
$('#libSearch').addEventListener('input', renderLibrary);
$('#libGo').addEventListener('click', renderLibrary);

/* =====================================================================
   Pack editor
   ===================================================================== */
const PACK_ICONS = ['microphone-stage', 'confetti', 'heart-break', 'fire', 'flower', 'guitar', 'music-notes', 'moon-stars', 'pizza', 'cat', 'crown', 'disco-ball', 'vinyl-record', 'piano-keys', 'microphone', 'star', 'headphones', 'balloon'];
const CHANNELS = ['Stingray Karaoke', 'Party Tyme Karaoke', 'ZZang KARAOKE', 'Musisi Karaoke', 'שרים קריוקי'];
$('#peChannels').innerHTML = CHANNELS.map((c) => `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(c)}" target="_blank" rel="noopener">${ic('youtube-logo')}${esc(c)}</a>`).join('');
const PACK_COLORS = ['#ff4d3d', '#ff8c42', '#ffc22e', '#25d39b', '#3d8bff', '#a98bff', '#ff7aa2', '#5a6488'];
const PE = { pack: null, songs: [], sel: -1, player: null, playerReady: null, deleteArmed: false };
$('#peIcons').innerHTML = PACK_ICONS.map((n) => `<button data-i="${n}" title="${n}">${ic(n)}</button>`).join('');
$('#peColors').innerHTML = PACK_COLORS.map((c) => `<button class="swatch" style="--c:${c}" data-c="${c}"></button>`).join('');
$$('#peIcons button').forEach((b) => b.addEventListener('click', () => { PE.icon = b.dataset.i; renderEditorHead(); sfx.click(); }));
$$('#peColors .swatch').forEach((b) => b.addEventListener('click', () => { PE.color = b.dataset.c; renderEditorHead(); sfx.click(); }));
function renderEditorHead() {
  $('#peCover').outerHTML = cover({ songs: PE.songs, color: PE.color, icon: PE.icon }, 'big').replace('<span class="cover', '<span id="peCover" class="cover');
  $$('#peIcons button').forEach((b) => b.classList.toggle('on', b.dataset.i === PE.icon));
  $$('#peColors .swatch').forEach((b) => b.classList.toggle('on', b.dataset.c === PE.color));
}
function openEditor(pack) {
  PE.pack = pack || null;
  PE.songs = pack ? pack.songs.map((s) => ({ ...s })) : [];
  PE.icon = pack?.icon || 'microphone-stage';
  PE.color = pack?.color || '#ff4d3d';
  PE.sel = -1;
  PE.deleteArmed = false;
  $('#peTitle').textContent = pack ? 'EDIT PACK' : 'CREATE PACK';
  $('#peName').value = pack?.name || '';
  $('#peLink').value = '';
  $('#peDelete').hidden = !pack;
  $('#peDelete .lbl').textContent = 'DELETE PACK';
  peMsg('', '');
  renderEditorHead();
  renderSongs();
  selectSong(PE.songs.length ? 0 : -1);
  $('#m-pack').classList.add('open');
  setTimeout(() => (pack ? null : $('#peName').focus()), 50);
}
const MSG_ICON = { bad: 'warning-circle', ok: 'check-circle', warn: 'warning', '': 'info' };
function peMsg(text, kind) { const el = $('#peMsg'); el.innerHTML = text ? `${ic(MSG_ICON[kind] || 'info')}<span>${esc(text)}</span>` : ''; el.className = `pe-msg ${kind}`; }
function renderSongs() {
  $('#peSongs').innerHTML = PE.songs.map((s, i) => `
    <div class="pe-song ${i === PE.sel ? 'sel' : ''}" data-i="${i}">
      <span class="i">${i + 1}</span><img src="${s.thumb}" alt="">
      <div><div class="t">${esc(s.title)}</div><div class="c">${esc(s.channel)}</div></div>
      <span class="tm ${s.start ? '' : 'unset'}" title="${s.start ? 'Singing starts here' : 'Set where the singing starts'}">${ic(s.start ? 'flag' : 'warning')}${s.start ? fmt(s.start) : 'Set start'}${s.end ? ` - ${fmt(s.end)}` : s.duration ? ` · ${fmt(s.duration)}` : ''}</span>
      <button class="del" data-del="${i}" title="Remove">${ic('trash')}</button>
    </div>`).join('') || `<div class="empty"><span class="em-ic">${ic('youtube-logo', 'ph-duotone')}</span><b>No songs yet</b>Paste a YouTube karaoke link above. Search YouTube for “song name karaoke”.</div>`;
  $('#peCount').innerHTML = `${ic('music-notes')}<span>${PE.songs.length} song${PE.songs.length === 1 ? '' : 's'}</span>`;
  renderEditorHead();
  $$('#peSongs .pe-song').forEach((el) => el.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { PE.songs.splice(+del.dataset.del, 1); if (PE.sel >= PE.songs.length) PE.sel = PE.songs.length - 1; renderSongs(); selectSong(PE.sel); return; }
    selectSong(+el.dataset.i);
  }));
}
async function ensurePreviewPlayer() {
  if (PE.playerReady) return PE.playerReady;
  PE.playerReady = (async () => {
    const YT = await loadYouTube();
    if (!YT) return null;
    return new Promise((resolve) => {
      PE.player = new YT.Player('pePlayer', { width: '100%', height: '100%', playerVars: { ...PLAYER_VARS, controls: 1, origin: location.origin }, events: { onReady: () => resolve(PE.player) } });
    });
  })();
  return PE.playerReady;
}
async function selectSong(i) {
  PE.sel = i;
  $$('#peSongs .pe-song').forEach((el) => el.classList.toggle('sel', +el.dataset.i === i));
  const s = PE.songs[i];
  $('#pePrevTitle').textContent = s ? s.title : 'Pick a song to preview';
  $('#peStart').value = s ? fmt(s.start) : '';
  $('#peEnd').value = s?.end ? fmt(s.end) : '';
  const p = await ensurePreviewPlayer();
  if (p && s) {
    p.cueVideoById({ videoId: s.videoId, startSeconds: s.start });
    setTimeout(() => {
      const d = p.getDuration?.() || 0;
      if (d > 5 && PE.songs[i] === s && !s.duration) { s.duration = Math.round(d); net.send({ t: 'duration', videoId: s.videoId, seconds: d }); renderSongs(); }
    }, 1500);
  }
}
function updateTrim() {
  const s = PE.songs[PE.sel];
  if (!s) return;
  const st = parseTime($('#peStart').value);
  const en = parseTime($('#peEnd').value);
  if (st != null) s.start = Math.max(0, st);
  s.end = en != null && en > s.start + 5 ? en : null;
  renderSongs();
}
$('#peStart').addEventListener('change', updateTrim);
$('#peEnd').addEventListener('change', updateTrim);
$('#peSetStart').addEventListener('click', () => { if (!PE.player || PE.sel < 0) return; $('#peStart').value = fmt(PE.player.getCurrentTime()); updateTrim(); sfx.click(); });
$('#peSetEnd').addEventListener('click', () => { if (!PE.player || PE.sel < 0) return; $('#peEnd').value = fmt(PE.player.getCurrentTime()); updateTrim(); sfx.click(); });
async function addSong() {
  const link = $('#peLink').value.trim();
  if (!link) return;
  peMsg('Checking the video…', '');
  let res;
  try { res = await (await fetch(`/api/youtube?url=${encodeURIComponent(link)}`)).json(); } catch { res = { ok: false, reason: 'Couldn’t reach the server.' }; }
  if (!res.ok) { peMsg(res.reason, 'bad'); sfx.aww(); return; }
  if (PE.songs.some((s) => s.videoId === res.videoId)) { peMsg('That song is already in this pack.', 'warn'); return; }
  PE.songs.push({ videoId: res.videoId, title: res.title, channel: res.channel, thumb: res.thumb, start: res.start || 0, end: null });
  $('#peLink').value = '';
  peMsg(res.karaoke ? `Added “${res.title}”. Set where the singing starts.` : `Added, but this doesn’t look like a karaoke video. Make sure it has no original vocals.`, res.karaoke ? 'ok' : 'warn');
  sfx.ding();
  renderSongs();
  selectSong(PE.songs.length - 1);
  $('#peSongs').scrollTop = 1e6;
}
$('#peAdd').addEventListener('click', addSong);
$('#peLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSong(); });
$('#peSave').addEventListener('click', async () => {
  const name = $('#peName').value.trim();
  if (!name) { peMsg('Give your pack a name.', 'bad'); $('#peName').focus(); return; }
  if (!PE.songs.length) { peMsg('Add at least one song.', 'bad'); return; }
  const body = { id: PE.pack?.id, name, icon: PE.icon, color: PE.color, author: S.me.name, songs: PE.songs };
  const res = await fetch('/api/packs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { peMsg('Couldn’t save the pack.', 'bad'); return; }
  const { pack } = await res.json();
  await loadPacks();
  if (isHost() && !PE.pack) net.send({ t: 'settings', patch: { packIds: [...S.room.settings.packIds, pack.id] } });
  closeModals();
  notify(`Saved “${pack.name}”.`, 'ok', 2500);
  sfx.ding();
  renderLobby(false);
});
$('#peDelete').addEventListener('click', async () => {
  if (!PE.pack) return;
  if (!PE.deleteArmed) { PE.deleteArmed = true; $('#peDelete .lbl').textContent = 'CLICK AGAIN TO DELETE'; return; }
  await fetch(`/api/packs/${PE.pack.id}`, { method: 'DELETE' });
  await loadPacks();
  if (isHost()) net.send({ t: 'settings', patch: { packIds: S.room.settings.packIds.filter((id) => id !== PE.pack.id) } });
  closeModals();
  renderLobby(false);
});
function closeModals() {
  $$('.modal').forEach((m) => m.classList.remove('open'));
  PE.player?.pauseVideo?.();
}

/* =====================================================================
   Settings
   ===================================================================== */
function bindSlider(id, get, set, show) {
  const el = $(id);
  const out = el.parentElement.querySelector('b');
  el.value = get();
  out.textContent = show(get());
  el.addEventListener('input', () => { set(Number(el.value)); out.textContent = show(Number(el.value)); save('offkey.prefs', S.prefs); });
}
bindSlider('#volMusic', () => Math.round(S.prefs.music * 100), (v) => { S.prefs.music = v / 100; }, (v) => `${v}%`);
bindSlider('#volVoice', () => Math.round(S.prefs.voice * 100), (v) => { S.prefs.voice = v / 100; voice.setPeerVolume(S.prefs.voice); }, (v) => `${v}%`);
bindSlider('#volSfx', () => Math.round(S.prefs.sfx * 100), (v) => { S.prefs.sfx = v / 100; setSfxVolume(S.prefs.sfx); }, (v) => `${v}%`);
setSfxVolume(S.prefs.sfx);
voice.setPeerVolume(S.prefs.voice);
async function openSettings() {
  $('#m-settings').classList.add('open');
  const sel = $('#micSelect');
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    const cur = localStorage.getItem('offkey.mic') || '';
    sel.innerHTML = '<option value="">Default microphone</option>' + devs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === cur ? 'selected' : ''}>${esc(d.label || `Microphone ${i + 1}`)}</option>`).join('');
  } catch { sel.innerHTML = '<option value="">Default microphone</option>'; }
}
$('#micSelect').addEventListener('change', (e) => { voice.setDevice(e.target.value).then(hookMicMeter); });

/* =====================================================================
   Buttons and keys
   ===================================================================== */
$$('[data-act]').forEach((b) => b.addEventListener('click', () => {
  ensureAudio();
  const a = b.dataset.act;
  sfx.click();
  switch (a) {
    case 'play': openRooms(); break;
    case 'create': net.send({ t: 'create', isPublic: true }); break;
    case 'quick': net.send({ t: 'quick' }); break;
    case 'joinCode': { const c = $('#joinCode').value.trim().toUpperCase(); if (c.length === 5) net.send({ t: 'join', code: c }); else notify('Room codes have 5 letters.', 'bad', 2500); break; }
    case 'how': openHow(); break;
    case 'settings': openSettings(); break;
    case 'close': closeModals(); break;
    case 'newPack': openEditor(null); break;
    case 'library': openLibrary(); break;
    case 'addBot': net.send({ t: 'addBot' }); break;
    case 'start': net.send({ t: 'start' }); break;
    case 'ready': { const me = meInRoom(); if (!me) break; me.ready = !me.ready; net.send({ t: 'ready', ready: me.ready }); renderLobby(false); break; }
    case 'again': net.send({ t: 'again' }); break;
    case 'leave': leaveRoom(false); break;
  }
}));
$('#joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-act="joinCode"]').click(); });
$$('.btn, .arrow, .swatch, .rx, .vb').forEach((b) => b.addEventListener('pointerenter', () => sfx.hover()));
addEventListener('keydown', (e) => {
  if (e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { closeModals(); closePlayerMenu(); }
  if (!S.room) return;
  if (k === 'm') toggleMute();
  const r = S.room;
  if (S.screen === 'game' && r.phase === 'sing' && !iSing()) {
    const map = { 1: 'clap', 2: 'laugh', 3: 'fire', 4: 'tomato' };
    if (map[k]) react(map[k], $(`.rx[data-rx="${map[k]}"]`));
  }
  const slot = { q: 0, w: 1, e: 2 }[k];
  if (S.screen === 'game' && slot !== undefined) playCard($$('#handCards .pw.play')[slot]);
  if (S.screen === 'game' && r.phase === 'vote' && '12345'.includes(k) && k) castVote(+k);
  if (S.screen === 'game' && r.phase === 'pick' && '123'.includes(k) && k) pickSong(+k - 1);
  if (S.screen === 'game' && r.phase === 'announce' && iSing() && k === 'enter') $('#singReady').click();
});

/* =====================================================================
   Name tags and the frame loop
   ===================================================================== */
const tagEls = new Map();
function updateTags() {
  const r = S.room;
  const show = r && S.screen === 'game' && ['announce', 'sing', 'vote'].includes(r.phase);
  const ids = new Set(r ? r.players.map((p) => p.id) : []);
  for (const [id, el] of tagEls) if (!ids.has(id) || !show) { el.classList.remove('show'); if (!ids.has(id)) { el.remove(); tagEls.delete(id); } }
  if (!show) return;
  for (const p of r.players) {
    // While someone sings only their tag shows (and none at all when it's you)
    if (S.screen === 'game' && r.phase === 'sing' && (p.id !== r.singerId || iSing())) { tagEls.get(p.id)?.classList.remove('show'); continue; }
    let el = tagEls.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.innerHTML = `<i class="ph-fill ph-check-circle ic ready"></i><i class="ph-fill ph-microphone ic talk"></i><span class="nm"></span><span class="sub"></span>`;
      $('#tags').appendChild(el);
      tagEls.set(p.id, el);
    }
    const pos = scene.screenOf(p.id, 0.3);
    if (!pos) { el.classList.remove('show'); continue; }
    const sub = !p.connected && !p.bot ? 'offline' : p.bot ? 'bot' : '';
    const cls = ['tag', 'show',
      p.id === S.me.id && 'me',
      p.id === r.singerId && S.screen === 'game' && 'singer',
      S.screen === 'lobby' && p.id === r.hostId && 'host',
      ((S.screen === 'lobby' && (p.ready || p.bot || p.id === r.hostId)) || (r.phase === 'vote' && r.voted.includes(p.id))) && 'ok',
      !p.connected && !p.bot && 'off'].filter(Boolean).join(' ');
    if (el.className !== cls) el.className = cls;
    const nm = p.id === S.me.id ? 'You' : p.name;
    const nmEl = el.querySelector('.nm');
    if (nmEl.textContent !== nm) nmEl.textContent = nm;
    const subEl = el.querySelector('.sub');
    if (subEl.textContent !== sub) subEl.textContent = sub;
    el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
/** Loudness right now: our own mic, or the audio we're playing for someone else. */
const talkUntil = new Map();
const levels = new Map();
function talkLevel(id) {
  if (id === S.me.id) return readMicLevel();
  return voice.liveLevel(id) || voice.level(id) * 2.5;
}
const isTalking = (id) => (talkUntil.get(id) || 0) > performance.now();

function updateMouths() {
  if (!S.room) return;
  const now = performance.now();
  for (const p of S.room.players) {
    if (p.bot) { if (!(S.room.phase === 'sing' && p.id === S.room.singerId)) scene.setTalk(p.id, 0); continue; }
    const lvl = talkLevel(p.id);
    levels.set(p.id, lvl);
    if (lvl > 0.07) talkUntil.set(p.id, now + 260);
    scene.setTalk(p.id, lvl > 0.06 ? clamp(0.25 + lvl, 0, 1) : 0);
  }
  if (S.screen === 'game') $$('#scoreboard .sb').forEach((el) => el.classList.toggle('talking', isTalking(el.dataset.id)));
  if (S.screen === 'lobby') {
    $('#voiceLevel').style.width = `${readMicLevel() * 100}%`;
    $$('#slots .slot[data-id]').forEach((el) => el.classList.toggle('talking', isTalking(el.dataset.id)));
  }
}

/* Speaking bubbles: a mic with live level bars above whoever is talking */
const speakEls = new Map();
function updateSpeakBubbles() {
  const r = S.room;
  const ids = new Set(r ? r.players.map((p) => p.id) : []);
  for (const [id, el] of speakEls) if (!ids.has(id)) { el.remove(); speakEls.delete(id); }
  if (!r || !['lobby', 'game', 'final'].includes(S.screen)) { for (const el of speakEls.values()) el.classList.remove('on'); return; }
  for (const p of r.players) {
    if (p.bot) continue;
    let el = speakEls.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'speak';
      el.innerHTML = '<i class="ph-fill ph-microphone"></i><span class="bars"><i></i><i></i><i></i></span>';
      $('#tags').appendChild(el);
      speakEls.set(p.id, el);
    }
    const hide = S.screen === 'game' && (p.id === S.me.id || (r.phase === 'sing' && p.id !== r.singerId));
    const pos = !hide && scene.screenOf(p.id, S.screen === 'game' ? 0.85 : 0.35);
    const on = !!pos && isTalking(p.id);
    el.classList.toggle('on', on);
    el.classList.toggle('muted', mutedPeers.has(p.id));
    if (pos) {
      el.style.translate = `${pos.x}px ${pos.y}px`;
      el.style.transform = 'translate(-50%, -100%)';
      el.style.setProperty('--l', clamp(levels.get(p.id) || 0, 0, 1).toFixed(2));
    }
  }
}

/* Player menu: mute someone just for you, or (host) kick them */
const mutedPeers = new Set();
let pmFor = null;
function openPlayerMenu(id, anchorEl) {
  const p = player(id);
  if (!p || id === S.me.id) return;
  pmFor = id;
  const m = $('#pmenu');
  $('#pmAv').innerHTML = avatar(p.look);
  $('#pmName').textContent = p.name;
  $('#pmSub').textContent = p.bot ? 'Bot' : id === S.room.hostId ? 'Host' : p.connected ? 'In the room' : 'Offline';
  $('#pmMute').hidden = p.bot;
  $('#pmMute span').textContent = mutedPeers.has(id) ? 'Unmute for me' : 'Mute for me';
  $('#pmMute i').className = `ph-fill ${mutedPeers.has(id) ? 'ph-speaker-high' : 'ph-speaker-slash'}`;
  $('#pmKick').hidden = !isHost();
  $('#pmKick').classList.remove('armed');
  $('#pmKick span').textContent = 'Kick from room';
  m.hidden = false;
  const r = anchorEl.getBoundingClientRect();
  m.style.left = `${clamp(r.left + r.width / 2 - 115, 12, innerWidth - 242)}px`;
  m.style.top = `${r.bottom + 14 + 200 > innerHeight ? r.top - m.offsetHeight - 14 : r.bottom + 14}px`;
  sfx.click();
}
function closePlayerMenu() { $('#pmenu').hidden = true; pmFor = null; }
function rectAt(x, y) { return { getBoundingClientRect: () => ({ left: x - 1, top: y - 1, width: 2, height: 2, bottom: y + 1 }) }; }
$('#scene').addEventListener('click', (e) => {
  if (!S.room || !['lobby', 'game', 'final'].includes(S.screen)) return;
  const id = scene.pick(e.clientX, e.clientY);
  if (id && id !== S.me.id) openPlayerMenu(id, rectAt(e.clientX, e.clientY + 10));
});
let hoverPick = 0;
$('#scene').addEventListener('pointermove', (e) => {
  if (performance.now() - hoverPick < 80) return;
  hoverPick = performance.now();
  const id = S.room && ['lobby', 'game', 'final'].includes(S.screen) ? scene.pick(e.clientX, e.clientY) : null;
  $('#scene').style.cursor = id && id !== S.me.id ? 'pointer' : '';
});
$('#pmMute').addEventListener('click', () => {
  if (!pmFor) return;
  mutedPeers.has(pmFor) ? mutedPeers.delete(pmFor) : mutedPeers.add(pmFor);
  voice.setPersonalMute(new Set(mutedPeers));
  notify(mutedPeers.has(pmFor) ? `${player(pmFor)?.name} is muted for you.` : `${player(pmFor)?.name} is unmuted.`, 'ok', 2200);
  if (S.screen === 'lobby') renderSlots(true);
  closePlayerMenu();
});
$('#pmKick').addEventListener('click', () => {
  const b = $('#pmKick');
  if (!pmFor || !isHost()) return;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); $('span', b).textContent = 'Tap again to kick'; sfx.tick(true); return; }
  const id = pmFor;
  net.send({ t: 'kick', id });
  // Show it right away; the server confirms to everyone in the same instant
  S.room.players = S.room.players.filter((p) => p.id !== id);
  scene.setPlayers(S.room.players);
  if (S.screen === 'lobby') renderLobby(false);
  if (S.screen === 'game') renderScoreboard();
  closePlayerMenu();
});
addEventListener('pointerdown', (e) => { if (!$('#pmenu').hidden && !e.target.closest('#pmenu') && !e.target.closest('[data-pm]') && e.target.id !== 'scene') closePlayerMenu(); }, true);

/*
 * Automatic voice sync. The crowd hears the singer's voice later than the singer hears the
 * music: singer to voice server, server to us, then our jitter buffer, plus capture and
 * playback (about 40 ms). We measure all of it live and delay our copy of the music by exactly
 * that much, so the voice and the song land together. Everyone reports their own round trip
 * through the game server so listeners can include the singer's half.
 */
let syncBusy = false;
setInterval(async () => {
  if (!S.room || S.voiceState !== 'on' || syncBusy) return;
  syncBusy = true;
  const r = S.room;
  const singer = r.phase === 'sing' || r.phase === 'announce' ? r.singerId : null;
  const m = await voice.measure(singer && singer !== S.me.id ? singer : null);
  syncBusy = false;
  if (!m) return;
  if (m.rtt != null) net.send({ t: 'vrtt', ms: m.rtt });
  if (!singer || singer === S.me.id || player(singer)?.bot) return;
  const singerRtt = player(singer)?.vrtt ?? m.rtt ?? 80;
  const target = (singerRtt + (m.rtt ?? 80)) / 2 + (m.jitter ?? 60) + 40;
  S.syncDelay = Math.round(clamp(S.syncDelay * 0.6 + target * 0.4, 40, 700));
}, 1000);

let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  scheduleLounge();
  updateGame();
  updateMouths();
  scene.step(dt);
  scene.render();
  updateTags();
  updateSpeakBubbles();
  placeMenuUI();
  requestAnimationFrame(frame);
}

/* =====================================================================
   Boot: the loading screen
   ===================================================================== */
async function boot() {
  const bar = $('#ldFill'), txt = $('#ldTxt');
  const progress = (p, label) => { bar.style.width = `${p}%`; if (label) txt.textContent = label; };
  requestAnimationFrame(frame);
  progress(12, 'Warming up the mic…');
  await Promise.race([document.fonts.load('140px "Lilita One"'), sleep(2500)]);
  scene.paintText();
  progress(35, 'Dusting off the stage…');
  const welcome = new Promise((r) => { welcomed = r; });
  net.connect();
  await Promise.race([welcome, sleep(5000)]);
  progress(60, 'Tuning the speakers…');
  await Promise.race([karaoke.init(), sleep(8000)]);
  progress(85, 'Stacking the song packs…');
  await loadPacks();
  progress(100, 'Let’s go!');
  await sleep(350);
  const loading = $('#loading');
  loading.classList.add('leaving');
  await sleep(380);
  applyScreen(S.room ? (S.room.phase === 'lobby' ? 'lobby' : S.room.phase === 'final' ? 'final' : 'game') : 'menu');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 500);
  const code = new URLSearchParams(location.search).get('room');
  if (code && !S.room) net.send({ t: 'join', code: code.toUpperCase() });
  if (!S.voiceOk) notify('Voice chat is off: the server has no LiveKit keys in .env.', 'bad', 5000);
}
boot();

/* Test hooks for automated checks */
window.__offkey = { S, scene, net, voice, karaoke, onMessage };
