/**
 * Rooms and the game loop. The server owns the state and the clock: clients send intents
 * ("I voted 4", "throw a tomato") and render whatever room state it broadcasts.
 *
 * A turn goes announce → sing → vote → verdict. Times are absolute server timestamps
 * (startAt, endAt, phaseEndsAt) so every client can line its YouTube player up with the others.
 *
 * Power-ups (settings.powers): 'off', 'classic' (everyone starts with the same three sabotages) or
 * 'draw' (a Lucky Draw opens every round and deals each player a random card, see client/js/powers.js).
 */
import { POWERS, CLASSIC_HAND, HAND_MAX, drawCard } from '../client/js/powers.js';
import { MISSIONS } from '../client/js/missions.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 6;
const COLORS = ['#3d8bff', '#ff7aa2', '#ffc22e', '#25d39b', '#a98bff', '#ff8c42', '#ff5a4e', '#2bc8c4', '#8fc742', '#e8dfd0', '#6b7cff', '#ff9ecf', '#ffe066', '#7fe0c0', '#c7a2ff', '#c66b3d', '#d94f8a', '#4fa3c7', '#5f9e4f', '#8a90a8'];
const HAT_COLORS = ['', '#ff4d3d', '#ff8c42', '#ffc22e', '#25d39b', '#2bc8c4', '#3d8bff', '#a98bff', '#ff7aa2', '#e8dfd0', '#8a5a2b', '#5f9e4f', '#1d1b22'];
const FACES = ['none', 'glasses', 'shades', 'hearts', 'monocle', 'mustache', 'freckles', 'lashes', 'bandage', 'beard', 'eyepatch', 'clown', 'bandit', 'stickers', 'whiskers', 'pixel', 'goggles', 'heartcheeks', 'disguise'];
const HATS = ['none', 'headphones', 'bow', 'cap', 'sprout', 'party', 'beanie', 'crown', 'cowboy', 'tophat', 'catears', 'propeller', 'wizard', 'chef', 'halo', 'viking', 'bandana', 'beret', 'bunny', 'flowers', 'afro', 'mohawk', 'santa', 'unicorn', 'devil', 'antennae', 'grad', 'sombrero', 'sweatband', 'pirate', 'mushroom', 'buns', 'astronaut', 'frog', 'bear', 'jester', 'fez', 'bucket', 'backcap'];
const MOODS = ['smile', 'grin', 'sad', 'angry', 'smug', 'shocked', 'sleepy', 'wink', 'love', 'starry', 'cool', 'goofy', 'laughing', 'shy', 'teary', 'evil', 'dizzy', 'angelic', 'nervous', 'kissy'];
const OUTFITS = ['none', 'bowtie', 'necktie', 'scarf', 'chain', 'lei', 'cape', 'tuxedo', 'suspenders', 'medal', 'guitar', 'wings', 'backpack', 'hoodie', 'apron', 'pearls', 'tutu', 'emblem', 'rose'];
const BOT_NAMES = ['Maya', 'Ari', 'Leo', 'Tal', 'Noa', 'Dan'];
export const LENGTHS = { 15: 15, 30: 30, 45: 45, 75: 75, 120: 120 };
// For automated tests: OFFKEY_TEST_CLIP=8 makes every song 8 seconds long
if (process.env.OFFKEY_TEST_CLIP) for (const k in LENGTHS) LENGTHS[k] = Number(process.env.OFFKEY_TEST_CLIP);
const COUNT_IN = 3500;
const ANNOUNCE_MIN = 3500;
const ANNOUNCE_MAX = 15000;
// Card ids are unique across every room and restart, so a client never confuses a new card with an old one
let cardSeq = Date.now() % 1e9;
const nextCardId = () => ++cardSeq;
// The singer gets this long to hit I'M READY, then they're readied automatically
const READY_MS = 5000;
const VOTE_MS = 12000;
// The standings break between rounds
const ROUND_END_MS = 6500;
// Song pick: the crowd votes between three songs, then the winner is shown for a moment
const PICK_MS = 9000;
const PICK_REVEAL = 1900;
const ROUNDS = [1, 3, 5, 7, 10];
// Lucky Draw timing: the reels spin, then stop one player at a time
const DRAW_FIRST_STOP = 2600;
const DRAW_STAGGER = 750;
const DRAW_HOLD = 3800;
const REACT = { clap: 0.025, fire: 0.035, laugh: 0.012, tomato: -0.045 };

const now = () => Date.now();
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cleanLook(look) {
  // The old cream was bright enough to glow under the stage lights
  if (look?.color === '#f2ede4') look = { ...look, color: '#e8dfd0' };
  if (look?.hatColor === '#f2ede4') look = { ...look, hatColor: '#e8dfd0' };
  return {
    color: COLORS.includes(look?.color) ? look.color : pick(COLORS),
    hat: HATS.includes(look?.hat) ? look.hat : pick(HATS),
    hatColor: HAT_COLORS.includes(look?.hatColor) ? look.hatColor : '',
    face: FACES.includes(look?.face) ? look.face : 'none',
    mood: MOODS.includes(look?.mood) ? look.mood : 'smile',
    outfit: OUTFITS.includes(look?.outfit) ? look.outfit : 'none',
  };
}

class Room {
  constructor(lobby, code, isPublic) {
    this.lobby = lobby;
    this.code = code;
    this.isPublic = isPublic;
    this.hostId = null;
    this.players = [];
    this.settings = { rounds: 3, length: '75', crowdVoice: 'distant', packIds: lobby.packs.list().slice(0, 1).map((p) => p.id), powers: 'draw', tomatoes: true, missions: true };
    this.timers = new Map();
    this.resetGame();
    this.phase = 'lobby';
    this.emptySince = 0;
  }

  resetGame() {
    this.phase = 'lobby';
    this.order = [];
    this.turn = -1;
    this.singerId = null;
    this.song = null;
    this.clip = 0;
    this.phaseStart = now();
    this.phaseEndsAt = 0;
    this.startAt = 0;
    this.endAt = 0;
    this.cued = new Set();
    this.singerReady = false;
    this.votes = {};
    this.verdict = null;
    this.sabs = [];
    this.hype = 0.5;
    this.hypeAt = now();
    this.used = new Set();
    this.boost = { double: false, shield: false };
    this.golden = new Set();
    this.draw = null;
    this.pick = null;
    this.missions = {};
    this.firstReact = null;
    this.drawnRound = -1;
    this.shownRound = 0;
    this.roundDone = -1;
    this.roundLen = 1;
  }

  /* ---------- Timers ---------- */
  setTimer(name, ms, fn) {
    this.clearTimer(name);
    this.timers.set(name, setTimeout(() => { this.timers.delete(name); fn(); }, Math.max(0, ms)));
  }
  setRepeat(name, ms, fn) {
    this.clearTimer(name);
    const h = setInterval(fn, ms);
    this.timers.set(name, { interval: h });
  }
  clearTimer(name) {
    const h = this.timers.get(name);
    if (!h) return;
    if (h.interval) clearInterval(h.interval); else clearTimeout(h);
    this.timers.delete(name);
  }
  clearTimers() { for (const name of [...this.timers.keys()]) this.clearTimer(name); }

  /* ---------- Players ---------- */
  get humans() { return this.players.filter((p) => !p.bot); }
  get active() { return this.players.filter((p) => p.bot || p.connected); }
  player(id) { return this.players.find((p) => p.id === id) || null; }

  add(conn) {
    if (this.players.length >= MAX_PLAYERS) return 'This room is full.';
    if (this.phase !== 'lobby') return 'That game has already started. Try another room.';
    const p = { id: conn.id, name: conn.name, look: conn.look, ready: false, connected: true, score: 0, bot: false, hand: [], buffs: {}, conn };
    this.players.push(p);
    if (!this.hostId || !this.player(this.hostId)?.connected) this.hostId = p.id;
    conn.room = this;
    this.emptySince = 0;
    this.sendRoom();
    return null;
  }

  addBot() {
    if (this.players.length >= MAX_PLAYERS || this.phase !== 'lobby') return;
    const names = this.players.map((p) => p.name);
    const colors = this.players.map((p) => p.look.color);
    const hats = this.players.map((p) => p.look.hat);
    const name = BOT_NAMES.find((n) => !names.includes(n)) || `Bot ${this.players.length + 1}`;
    this.players.push({
      id: `bot-${Math.random().toString(36).slice(2, 8)}`,
      name,
      look: { color: pick(COLORS.filter((c) => !colors.includes(c))) || pick(COLORS), hat: pick(HATS.filter((h) => !hats.includes(h))) || pick(HATS), hatColor: Math.random() < 0.4 ? pick(HAT_COLORS) : '', face: Math.random() < 0.5 ? pick(FACES) : 'none', mood: pick(MOODS), outfit: Math.random() < 0.6 ? pick(OUTFITS) : 'none' },
      ready: true, connected: true, score: 0, bot: true, hand: [], buffs: {}, skill: rand(0.35, 0.9), conn: null,
    });
    this.sendRoom();
  }

  remove(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    if (p.conn) p.conn.room = null;
    this.afterLeave(p);
  }

  disconnect(conn) {
    const p = this.player(conn.id);
    if (!p) return;
    if (this.phase === 'lobby') { this.remove(p.id); return; }
    p.connected = false;
    p.conn = null;
    this.afterLeave(p);
  }

  afterLeave(p) {
    if (this.hostId === p.id) this.hostId = this.humans.find((h) => h.connected)?.id || null;
    if (!this.humans.some((h) => h.connected)) {
      // Keep the game clock running: a reload or a dropped connection rejoins mid-game.
      // The sweep closes rooms that stay empty for a minute.
      this.emptySince = now();
      return;
    }
    if ((this.phase === 'pick' || this.phase === 'announce' || this.phase === 'sing') && this.singerId === p.id) this.nextTurn();
    else if (this.phase === 'pick') this.checkPick();
    else if (this.phase === 'announce') this.checkAnnounce();
    else if (this.phase === 'vote') this.checkVotes();
    else if (this.phase !== 'lobby' && this.active.length < 2) this.finish();
    this.sendRoom();
  }

  reattach(conn) {
    const p = this.player(conn.id);
    if (!p || p.bot) return false;
    p.connected = true;
    p.conn = conn;
    p.name = conn.name;
    conn.room = this;
    if (!this.hostId || !this.player(this.hostId)?.connected) this.hostId = p.id;
    this.emptySince = 0;
    this.sendRoom();
    return true;
  }

  /** The next singers in line (during a draw, starting with whoever opens the round). */
  /** Everyone singing in the current round, in order (each round, every player sings once). */
  lineup() {
    if (this.turn < 0 || !this.order.length) return [];
    const from = Math.floor(this.turn / this.roundLen) * this.roundLen;
    return this.order.slice(from, from + this.roundLen);
  }
  upcoming() {
    const from = this.phase === 'draw' || this.phase === 'roundEnd' ? this.turn : this.turn + 1;
    return this.order.slice(Math.max(0, from)).filter((id) => this.active.some((p) => p.id === id)).slice(0, 3);
  }

  /* ---------- Messages ---------- */
  /**
   * The room as one player sees it. Cards are secret: you only get your own hand, and in a Lucky
   * Draw you only see what others drew when it's an instant card (points won or lost happen in
   * public). Everyone sees how many cards each player holds.
   */
  view(forId) {
    const voting = this.phase === 'vote';
    const draw = this.phase === 'draw' && this.draw ? {
      ...this.draw,
      results: this.draw.results.map((r) => (r.id === forId ? r : { id: r.id, revealAt: r.revealAt, delta: 0, kind: null })),
    } : null;
    return {
      code: this.code,
      isPublic: this.isPublic,
      hostId: this.hostId,
      phase: this.phase,
      turn: this.turn,
      totalTurns: this.order.length,
      roundLen: this.roundLen,
      roundDone: this.roundDone,
      mission: this.missions[forId] || null,
      lineup: this.phase === 'lobby' || this.phase === 'final' ? [] : this.lineup(),
      boost: this.boost,
      draw,
      pick: this.phase === 'pick' ? this.pick : null,
      upNext: this.phase === 'lobby' || this.phase === 'final' ? [] : this.upcoming(),
      singerId: this.singerId,
      song: this.song,
      clip: this.clip,
      phaseEndsAt: this.phaseEndsAt,
      startAt: this.startAt,
      endAt: this.endAt,
      cued: [...this.cued],
      singerReady: this.singerReady,
      readyBy: this.readyBy || 0,
      voted: Object.keys(this.votes),
      verdict: voting ? null : this.verdict,
      sabs: this.sabs,
      hype: this.currentHype(),
      settings: this.settings,
      players: this.players.map((p) => ({ id: p.id, name: p.name, look: p.look, ready: p.ready, connected: p.connected, score: p.score, bot: p.bot, hand: p.id === forId ? p.hand || [] : [], buffs: p.id === forId ? p.buffs || {} : {}, cards: (p.hand?.length || 0) + Object.values(p.buffs || {}).reduce((a, n) => a + n, 0), vrtt: p.vrtt ?? null })),
      serverNow: now(),
    };
  }
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players) if (p.conn) p.conn.sendRaw(data);
  }
  sendRoom() { for (const p of this.players) if (p.conn) p.conn.sendRaw(JSON.stringify({ t: 'room', room: this.view(p.id) })); }

  /* ---------- Lobby actions ---------- */
  isHost(conn) { return conn.id === this.hostId; }

  setSettings(patch) {
    if (this.phase !== 'lobby') return;
    const s = this.settings;
    if (ROUNDS.includes(patch.rounds)) s.rounds = patch.rounds;
    if (String(patch.length) in LENGTHS) s.length = String(patch.length);
    if (['off', 'classic', 'draw'].includes(patch.powers)) s.powers = patch.powers;
    if (['off', 'distant', 'live'].includes(patch.crowdVoice)) s.crowdVoice = patch.crowdVoice;
    if (typeof patch.tomatoes === 'boolean') s.tomatoes = patch.tomatoes;
    if (typeof patch.missions === 'boolean') s.missions = patch.missions;
    if (Array.isArray(patch.packIds)) s.packIds = patch.packIds.filter((id) => this.lobby.packs.get(id)).slice(0, 20);
    this.sendRoom();
  }

  songPool() {
    return this.settings.packIds.flatMap((id) => this.lobby.packs.get(id)?.songs || []);
  }

  start(conn) {
    if (this.phase !== 'lobby') return null;
    if (this.active.length < 2) return 'You need at least 2 players. Invite a friend or add a bot.';
    const waiting = this.humans.filter((p) => p.id !== this.hostId && !p.ready);
    if (waiting.length) return `Waiting for ${waiting.map((p) => p.name).join(', ')} to be ready.`;
    if (!this.songPool().length) return 'Pick at least one song pack with songs in it.';
    this.resetGame();
    for (const p of this.players) {
      p.score = 0;
      p.buffs = {};
      p.hand = this.settings.powers === 'classic' ? CLASSIC_HAND.map((kind) => ({ id: nextCardId(), kind })) : [];
    }
    const ids = this.active.map((p) => p.id);
    this.roundLen = ids.length;
    for (let r = 0; r < this.settings.rounds; r++) {
      let cycle = shuffle([...ids]);
      if (this.order.length && cycle[0] === this.order[this.order.length - 1] && cycle.length > 1) cycle.push(cycle.shift());
      this.order.push(...cycle);
    }
    this.nextTurn();
    return null;
  }

  backToLobby() {
    this.clearTimers();
    this.players = this.players.filter((p) => p.bot || p.connected);
    for (const p of this.players) { p.ready = p.bot; p.score = 0; p.hand = []; p.buffs = {}; }
    this.resetGame();
    this.sendRoom();
  }

  /* ---------- The game ---------- */
  /**
   * Seconds of singing a song offers from its start point: up to its end mark, or to just before
   * the video ends (players report each video's length the first time it loads).
   */
  singable(s, from = s.start) {
    const stop = s.end ?? (s.duration ? s.duration - 6 : null);
    return stop ? Math.max(0, stop - from) : Infinity;
  }

  /**
   * Up to three fresh songs for the room to choose from, preferring ones long enough for the chosen
   * length. Songs already sung this game come back only once the packs run out.
   */
  songChoices() {
    let pool = this.songPool().filter((x) => !this.used.has(x.videoId));
    if (pool.length < 3) { this.used.clear(); pool = this.songPool(); }
    const want = LENGTHS[this.settings.length];
    const fits = shuffle(pool.filter((x) => this.singable(x) >= want * 0.9));
    const rest = shuffle(pool.filter((x) => !fits.includes(x)));
    const out = [];
    for (const x of [...fits, ...rest]) {
      if (!out.some((o) => o.videoId === x.videoId)) out.push(x);
      if (out.length === 3) break;
    }
    return out;
  }

  /**
   * Turn a pack song into this turn's song. Short clips start at the chorus when the song has one
   * marked (the part everyone knows); longer ones start where the singing begins. The clip never
   * runs past the song's end mark.
   */
  songFrom(x) {
    const want = LENGTHS[this.settings.length];
    const start = want <= 30 && x.hook != null ? x.hook : x.start;
    this.used.add(x.videoId);
    this.clip = Math.round(Math.max(8, Math.min(want, this.singable(x, start))));
    return { videoId: x.videoId, title: x.title, channel: x.channel, start };
  }

  nextTurn() {
    this.clearTimers();
    do { this.turn++; } while (this.turn < this.order.length && !this.active.some((p) => p.id === this.order[this.turn]));
    if (this.turn >= this.order.length || this.active.length < 2) { this.finish(); return; }
    this.proceed();
  }
  /** Between turns: close the round if one just ended, open the next with a draw, then the turn. */
  proceed() {
    const round = Math.floor(this.turn / this.roundLen);
    if (round > this.shownRound) { this.shownRound = round; this.beginRoundEnd(round - 1); return; }
    if (this.settings.powers === 'draw' && round > this.drawnRound) { this.beginDraw(round); return; }
    this.startTurn();
  }

  /** Everyone has sung: a short break to show the standings before the next round starts. */
  beginRoundEnd(round) {
    this.clearTimers();
    this.phase = 'roundEnd';
    this.singerId = null;
    this.song = null;
    this.sabs = [];
    this.missions = {};
    this.roundDone = round;
    this.phaseStart = now();
    this.phaseEndsAt = this.phaseStart + ROUND_END_MS;
    this.setTimer('round-end', ROUND_END_MS, () => this.proceed());
    this.sendRoom();
  }

  /**
   * The Lucky Draw: every player gets a random card. Instant cards (points won, lost or stolen)
   * apply right away; the rest go into the player's hand. Clients hide each result until its reel
   * stops at revealAt, so the scores only move on screen when everyone sees why.
   */
  beginDraw(round) {
    this.drawnRound = round;
    this.phase = 'draw';
    this.singerId = null;
    this.song = null;
    this.sabs = [];
    const t0 = now();
    this.phaseStart = t0;
    const people = this.active;
    // Use it or lose it: whatever wasn't played last round is gone before the new deal
    for (const p of this.players) { p.hand = []; p.buffs = {}; }
    const results = people.map((p, i) => {
      const kind = drawCard(round === 0);
      const spec = POWERS[kind];
      const res = { id: p.id, kind, revealAt: t0 + DRAW_FIRST_STOP + i * DRAW_STAGGER, delta: 0 };
      if (spec.type === 'instant') {
        // Points cards wait (secretly) and land on top of your next song's score
        if (kind !== 'dud') p.buffs[kind] = (p.buffs[kind] || 0) + 1;
      } else if (spec.type === 'sab') {
        p.hand.push({ id: nextCardId(), kind });
        if (p.hand.length > HAND_MAX) res.dropped = p.hand.shift().kind;
      } else {
        // Boosts are automatic: they wait for your next song (or vote) and switch on by themselves
        p.buffs[kind] = (p.buffs[kind] || 0) + 1;
      }
      return res;
    });
    this.draw = { round, results, startAt: t0 };
    const ms = DRAW_FIRST_STOP + (people.length - 1) * DRAW_STAGGER + DRAW_HOLD;
    this.phaseEndsAt = t0 + ms;
    this.setTimer('draw', ms, () => this.startTurn());
    this.sendRoom();
  }

  startTurn() {
    this.clearTimers();
    if (this.active.length < 2) { this.finish(); return; }
    // The singer may have left during the draw
    if (!this.active.some((p) => p.id === this.order[this.turn])) { this.nextTurn(); return; }
    this.draw = null;
    this.missions = {};
    this.boost = { double: false, shield: false };
    this.golden = new Set();
    this.singerId = this.order[this.turn];
    this.song = null;
    this.votes = {};
    this.verdict = null;
    this.sabs = [];
    // The singer's waiting boosts switch on now
    const singer = this.player(this.singerId);
    for (const kind of ['double', 'shield']) {
      if (singer?.buffs?.[kind] > 0) {
        singer.buffs[kind]--;
        this.boost[kind] = true;
        this.broadcast({ t: 'power', by: singer.id, kind, target: singer.id, auto: true });
      }
    }
    const choices = this.songChoices();
    if (choices.length >= 2) { this.beginPick(choices); return; }
    this.song = this.songFrom(choices[0] || pick(this.songPool()));
    this.beginAnnounce();
  }

  /** The crowd picks the singer's song: three cards, a few seconds to vote, the most votes wins. */
  beginPick(choices) {
    this.phase = 'pick';
    this.phaseStart = now();
    this.phaseEndsAt = this.phaseStart + PICK_MS;
    this.choiceSongs = choices;
    this.pick = { options: choices.map((x) => ({ videoId: x.videoId, title: x.title, channel: x.channel })), votes: {}, chosen: -1 };
    this.setTimer('pick', PICK_MS, () => this.resolvePick());
    for (const b of this.players.filter((q) => q.bot && q.id !== this.singerId)) {
      this.setTimer(`bot-pick-${b.id}`, rand(1500, 6000), () => this.pickVote(b.id, Math.floor(Math.random() * choices.length)));
    }
    this.sendRoom();
  }
  pickVote(id, i) {
    if (this.phase !== 'pick' || !this.pick || this.pick.chosen >= 0) return;
    if (id === this.singerId || !this.player(id) || !Number.isInteger(i) || i < 0 || i >= this.pick.options.length) return;
    this.pick.votes[id] = i;
    this.sendRoom();
    this.checkPick();
  }
  checkPick() {
    if (this.phase !== 'pick' || this.pick?.chosen >= 0) return;
    const voters = this.active.filter((q) => q.id !== this.singerId);
    if (voters.every((q) => this.pick.votes[q.id] != null)) this.setTimer('pick', 600, () => this.resolvePick());
  }
  resolvePick() {
    if (this.phase !== 'pick' || this.pick.chosen >= 0) return;
    const tally = this.pick.options.map((_, i) => Object.values(this.pick.votes).filter((v) => v === i).length);
    const top = Math.max(...tally);
    // Most votes wins; a tie (or nobody voting) is settled at random among the leaders
    const leaders = tally.map((n, i) => (n === top ? i : -1)).filter((i) => i >= 0);
    this.pick.chosen = pick(leaders);
    this.pick.tally = tally;
    this.phaseEndsAt = now() + PICK_REVEAL;
    this.sendRoom();
    this.setTimer('pick-reveal', PICK_REVEAL, () => {
      this.song = this.songFrom(this.choiceSongs[this.pick.chosen]);
      this.beginAnnounce();
    });
  }

  beginAnnounce() {
    this.clearTimers();
    this.phase = 'announce';
    this.phaseStart = now();
    this.phaseEndsAt = this.phaseStart + ANNOUNCE_MAX;
    this.startAt = 0;
    this.endAt = 0;
    this.votes = {};
    this.verdict = null;
    this.sabs = [];
    this.cued = new Set(this.players.filter((p) => p.bot || !p.connected).map((p) => p.id));
    this.dealMissions();
    this.singerReady = this.player(this.singerId)?.bot ?? false;
    this.setTimer('announce-max', ANNOUNCE_MAX, () => this.beginSing());
    this.setTimer('announce-min', ANNOUNCE_MIN, () => this.checkAnnounce());
    this.readyBy = this.phaseStart + READY_MS;
    this.setTimer('announce-ready', READY_MS, () => { this.singerReady = true; this.sendRoom(); this.checkAnnounce(); });
    this.sendRoom();
  }

  cuedBy(conn) {
    if (this.phase !== 'announce') return;
    this.cued.add(conn.id);
    this.sendRoom();
    this.checkAnnounce();
  }
  singerReadyBy(conn) {
    if (this.phase !== 'announce' || conn.id !== this.singerId) return;
    this.singerReady = true;
    this.sendRoom();
    this.checkAnnounce();
  }
  checkAnnounce() {
    if (this.phase !== 'announce' || now() - this.phaseStart < ANNOUNCE_MIN - 50) return;
    const allCued = this.players.every((p) => !p.connected || p.bot || this.cued.has(p.id));
    if (allCued && this.singerReady) this.beginSing();
  }

  beginSing() {
    if (this.phase !== 'announce') return;
    this.clearTimers();
    this.phase = 'sing';
    this.phaseStart = now();
    this.startAt = this.phaseStart + COUNT_IN;
    this.endAt = this.startAt + this.clip * 1000 + 600;
    this.phaseEndsAt = this.endAt;
    this.hype = 0.5;
    this.hypeAt = now();
    this.sabs = [];
    this.setTimer('end', this.endAt - now(), () => this.beginVote());
    this.botSabDone = false;
    this.setRepeat('bots', 650, () => this.botTick());
    this.sendRoom();
  }

  currentHype() {
    const dt = (now() - this.hypeAt) / 1000;
    return 0.5 + (this.hype - 0.5) * Math.exp(-0.06 * dt);
  }

  /* ---------- Crowd missions ---------- */
  /**
   * Everyone in the crowd (people, not bots) gets a secret mission for this song. Missions differ
   * between players where possible, and nobody gets the same one twice in a row.
   */
  dealMissions() {
    this.missions = {};
    this.firstReact = null;
    if (!this.settings.missions) return;
    const crowd = shuffle(this.players.filter((p) => !p.bot && p.connected && p.id !== this.singerId));
    const taken = new Set();
    for (const p of crowd) {
      const isSab = (c) => POWERS[c.kind]?.type === 'sab';
      const ok = Object.keys(MISSIONS).filter((k) => {
        const m = MISSIONS[k];
        if (m.needs === 'tomatoes' && !this.settings.tomatoes) return false;
        if (m.needs === 'sab' && (this.settings.powers === 'off' || !p.hand?.some(isSab))) return false;
        return k !== p.lastMission;
      });
      const kind = pick(ok.filter((k) => !taken.has(k))) || pick(ok);
      if (!kind) continue;
      taken.add(kind);
      p.lastMission = kind;
      const goal = kind === 'mix' && !this.settings.tomatoes ? 3 : MISSIONS[kind].goal;
      this.missions[p.id] = { kind, n: 0, goal, done: false, failed: false, seen: [] };
    }
  }
  /** One step towards a player's mission; pays out the moment it's complete. */
  missionStep(id, by = 1) {
    const m = this.missions[id];
    if (!m || m.done || m.failed) return;
    m.n = Math.min(m.goal, m.n + by);
    if (m.n >= m.goal) this.missionDone(id);
  }
  missionDone(id) {
    const m = this.missions[id];
    const p = this.player(id);
    if (!m || m.done || !p) return;
    m.done = true;
    m.n = m.goal;
    const pts = MISSIONS[m.kind].pts;
    p.score += pts;
    this.broadcast({ t: 'mission', id, kind: m.kind, pts });
  }
  /** A reaction landed: count it for the missions it fits. */
  missionReact(id, kind) {
    const t = now();
    // First Fan is a race between people (the bots react far too fast to be fair)
    if (!this.firstReact && !this.player(id)?.bot) {
      this.firstReact = id;
      for (const [pid, m] of Object.entries(this.missions)) if (m.kind === 'first' && pid !== id && !m.done) m.failed = true;
    }
    const m = this.missions[id];
    if (!m || m.done || m.failed) return;
    const spec = MISSIONS[m.kind];
    if (!spec.on || !(spec.on.includes('any') || spec.on.includes(kind))) return;
    if (spec.when === 'last10' && t < this.endAt - 10000) return;
    if (spec.distinct) {
      if (m.seen.includes(kind)) return;
      m.seen.push(kind);
    }
    this.missionStep(id);
  }

  reactBy(id, kind) {
    const p = this.player(id);
    if (!p || this.phase !== 'sing' || now() < this.startAt || !(kind in REACT) || id === this.singerId) return;
    if (kind === 'tomato' && !this.settings.tomatoes) return;
    if (!p.bot) {
      const t = now();
      p.reacts = (p.reacts || []).filter((x) => t - x < 1000);
      if (p.reacts.length >= 6) return;
      p.reacts.push(t);
    }
    this.hype = Math.min(1, Math.max(0, this.currentHype() + REACT[kind]));
    this.hypeAt = now();
    this.broadcast({ t: 'react', from: id, kind, hype: this.hype });
    // Send the room only when a mission actually moved (reactions themselves go out as events)
    const before = JSON.stringify(this.missions);
    this.missionReact(id, kind);
    if (JSON.stringify(this.missions) !== before) this.sendRoom();
  }

  /** Remove a card from a hand. */
  take(p, card) { p.hand = p.hand.filter((c) => c.id !== card.id); }

  /** Play a card. Returns an error message, or null when it worked. */
  usePower(id, cardId) {
    const p = this.player(id);
    if (!p || this.settings.powers === 'off') return 'Not now.';
    const card = p.hand?.find((c) => c.id === cardId);
    if (!card) return 'You don’t have that card anymore.';
    const spec = POWERS[card.kind];
    const t = now();
    const event = { t: 'power', by: id, kind: card.kind, target: this.singerId };
    if (spec.type === 'sab') {
      if (this.phase !== 'sing') return 'Save it for someone’s song.';
      if (id === this.singerId) return 'That one is for someone else’s song.';
      const tail = Math.min(6000, this.clip * 250);
      if (t < this.startAt + 1500 || t > this.endAt - tail) return 'Too early or too late for that.';
      if (this.sabs.some((s) => s.until > t)) return 'Someone else is already causing chaos. Wait a sec.';
      this.take(p, card);
      if (this.missions[id]?.kind === 'chaos') this.missionStep(id);
      if (this.boost.shield) {
        // The singer's bodyguard eats the card
        this.broadcast({ ...event, blocked: true });
        this.sendRoom();
        return null;
      }
      const at = t + 300;
      this.sabs.push({ kind: card.kind, by: id, at, until: at + spec.ms, rate: spec.rate || 1, jump: spec.jump || 0 });
      if (spec.rate && spec.rate !== 1) {
        // A faster (or slower) video reaches the end of the clip sooner (or later)
        this.endAt -= (spec.rate - 1) * spec.ms;
        this.phaseEndsAt = this.endAt;
        this.setTimer('end', this.endAt - t, () => this.beginVote());
      }
      this.hype = clamp01(this.currentHype() + (spec.hype ?? -0.04));
      this.hypeAt = t;
      event.at = at;
    } else return 'That card works by itself.';
    this.broadcast(event);
    this.sendRoom();
    return null;
  }

  botTick() {
    if (this.phase !== 'sing' || now() < this.startAt) return;
    const h = this.currentHype();
    for (const b of this.players.filter((p) => p.bot && p.id !== this.singerId)) {
      if (Math.random() > 0.38) continue;
      const singer = this.player(this.singerId);
      const good = singer?.bot ? singer.skill : h;
      const w = { clap: 0.25 + good * 0.4, fire: good * 0.35, laugh: 0.2, tomato: this.settings.tomatoes ? (1 - good) * 0.35 : 0 };
      let r = Math.random() * Object.values(w).reduce((a, x) => a + x, 0);
      const kind = Object.keys(w).find((k) => (r -= w[k]) <= 0) || 'clap';
      this.reactBy(b.id, kind);
    }
    if (!this.botSabDone && Math.random() < 0.035) {
      const isSab = (c) => POWERS[c.kind].type === 'sab';
      const b = pick(this.players.filter((p) => p.bot && p.id !== this.singerId && p.hand.some(isSab)));
      if (b && !this.usePower(b.id, pick(b.hand.filter(isSab)).id)) this.botSabDone = true;
    }
  }

  beginVote() {
    if (this.phase !== 'sing') return;
    this.clearTimers();
    this.phase = 'vote';
    this.phaseStart = now();
    this.phaseEndsAt = this.phaseStart + VOTE_MS;
    for (const m of Object.values(this.missions)) if (!m.done && m.kind !== 'psychic') m.failed = true;
    this.votes = {};
    this.setTimer('end', VOTE_MS, () => this.beginVerdict());
    const singer = this.player(this.singerId);
    const quality = singer?.bot ? singer.skill * 0.6 + this.currentHype() * 0.4 : this.currentHype();
    for (const b of this.players.filter((p) => p.bot && p.id !== this.singerId)) {
      const v = Math.max(1, Math.min(5, Math.round(1 + quality * 4 + rand(-1, 1))));
      this.setTimer(`bot-vote-${b.id}`, rand(1200, 5000), () => this.vote(b.id, v));
    }
    this.sendRoom();
  }

  vote(id, v) {
    if (this.phase !== 'vote' || id === this.singerId || this.votes[id] || !Number.isInteger(v) || v < 1 || v > 5) return;
    const voter = this.player(id);
    if (!voter) return;
    this.votes[id] = v;
    // A waiting Golden Vote counts this one triple
    if (voter.buffs?.golden > 0 && !this.golden.has(id)) {
      voter.buffs.golden--;
      this.golden.add(id);
      this.broadcast({ t: 'power', by: id, kind: 'golden', target: this.singerId, auto: true });
    }
    this.sendRoom();
    this.checkVotes();
  }
  checkVotes() {
    if (this.phase !== 'vote') return;
    const voters = this.active.filter((p) => p.id !== this.singerId);
    if (voters.every((p) => this.votes[p.id])) this.setTimer('end', 700, () => this.beginVerdict());
  }

  beginVerdict() {
    if (this.phase !== 'vote') return;
    this.clearTimers();
    const ids = this.players.map((p) => p.id).filter((id) => this.votes[id]);
    // A Golden Vote counts three times
    const weight = (id) => (this.golden.has(id) ? 3 : 1);
    const total = ids.reduce((s, id) => s + weight(id), 0);
    const avg = ids.length ? ids.reduce((s, id) => s + this.votes[id] * weight(id), 0) / total : 3;
    const base = Math.round(avg * 20);
    const mult = this.boost.double ? 2 : 1;
    const pts = base * mult;
    const bonus = ids.length >= 2 ? ids.filter((id) => Math.abs(this.votes[id] - avg) <= 0.8) : [];
    const singer = this.player(this.singerId);
    if (singer) singer.score += pts;
    for (const id of bonus) { const p = this.player(id); if (p) p.score += 10; }
    // Points cards from the Lucky Draw land now, on top of the song
    const extras = [];
    for (const kind of ['jackpot', 'bonus20', 'bonus10', 'pickpocket', 'bust']) {
      for (; singer?.buffs?.[kind] > 0; singer.buffs[kind]--) {
        const spec = POWERS[kind];
        if (spec.steal) {
          const victim = this.players.filter((q) => q.id !== singer.id).sort((a, b) => b.score - a.score)[0];
          const amount = victim ? Math.min(spec.steal, victim.score) : 0;
          if (victim) victim.score -= amount;
          singer.score += amount;
          extras.push({ kind, pts: amount, victim: victim?.id || null });
        } else {
          const d = Math.max(-singer.score, spec.pts);
          singer.score += d;
          extras.push({ kind, pts: d });
        }
      }
    }
    // Mind Reader: your vote was exactly the crowd's score, rounded
    for (const [id, m] of Object.entries(this.missions)) {
      if (m.kind !== 'psychic' || m.done) continue;
      if (this.votes[id] && this.votes[id] === Math.round(avg)) this.missionDone(id); else m.failed = true;
    }
    this.verdict = { votes: { ...this.votes }, order: ids, avg, pts, base, mult, golden: [...this.golden], bonus, extras };
    this.phase = 'verdict';
    this.phaseStart = now();
    const ms = 1200 + ids.length * 800 + 1200 + 4200 + (extras.length ? 1800 : 0);
    this.phaseEndsAt = this.phaseStart + ms;
    this.setTimer('end', ms, () => this.nextTurn());
    this.sendRoom();
  }

  finish() {
    this.clearTimers();
    this.phase = 'final';
    this.singerId = null;
    this.phaseEndsAt = 0;
    this.sendRoom();
  }
}

export class Lobby {
  constructor(packs) {
    this.packs = packs;
    this.rooms = new Map();
    setInterval(() => this.sweep(), 10000);
  }

  code() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  /** The room a returning player was in before their connection dropped. */
  roomOf(playerId) {
    for (const r of this.rooms.values()) if (r.players.some((p) => p.id === playerId && !p.connected)) return r;
    return null;
  }

  list() {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && r.humans.some((p) => p.connected))
      .map((r) => ({
        code: r.code,
        host: r.player(r.hostId)?.name || '?',
        players: r.players.length,
        max: MAX_PLAYERS,
        phase: r.phase,
        packs: r.settings.packIds.map((id) => this.packs.get(id)?.name).filter(Boolean),
      }));
  }

  sweep() {
    for (const [code, r] of this.rooms) if (r.emptySince && now() - r.emptySince > 60000) { r.clearTimers(); this.rooms.delete(code); }
  }

  leave(conn) {
    const r = conn.room;
    if (!r) return;
    r.remove(conn.id);
    conn.room = null;
  }

  handle(conn, msg) {
    const r = conn.room;
    switch (msg.t) {
      case 'create': {
        this.leave(conn);
        const room = new Room(this, this.code(), msg.isPublic !== false);
        this.rooms.set(room.code, room);
        room.add(conn);
        return;
      }
      case 'join': {
        const room = this.rooms.get(clean(msg.code, 5).toUpperCase());
        if (!room) return conn.error('No room with that code. Check the letters and try again.');
        if (room === r) return;
        this.leave(conn);
        const err = room.add(conn);
        if (err) conn.error(err);
        return;
      }
      case 'quick': {
        const open = [...this.rooms.values()].filter((x) => x.isPublic && x.phase === 'lobby' && x.players.length < MAX_PLAYERS && x.humans.some((p) => p.connected) && x !== r);
        if (open.length) return this.handle(conn, { t: 'join', code: pick(open).code });
        return this.handle(conn, { t: 'create', isPublic: true });
      }
      case 'leave': this.leave(conn); conn.send({ t: 'left' }); return;
      case 'duration': this.packs.setDuration(String(msg.videoId || ''), Number(msg.seconds)); return;
      case 'profile': {
        conn.name = clean(msg.name, 16) || conn.name;
        conn.look = cleanLook(msg.look);
        const p = r?.player(conn.id);
        if (p) { p.name = conn.name; p.look = conn.look; r.sendRoom(); }
        return;
      }
    }
    if (!r) return;
    const host = r.isHost(conn);
    switch (msg.t) {
      case 'ready': { const p = r.player(conn.id); if (p && r.phase === 'lobby') { p.ready = !!msg.ready; r.sendRoom(); } return; }
      case 'settings': if (host) r.setSettings(msg.patch || {}); return;
      case 'visibility': if (host) { r.isPublic = !!msg.isPublic; r.sendRoom(); } return;
      case 'addBot': if (host) r.addBot(); return;
      case 'kick': {
        if (!host || msg.id === conn.id) return;
        const p = r.player(msg.id);
        if (!p) return;
        p.conn?.send({ t: 'kicked' });
        r.broadcast({ t: 'kick', id: p.id, name: p.name });
        r.remove(p.id);
        return;
      }
      case 'start': if (host) { const err = r.start(conn); if (err) conn.error(err); } return;
      case 'again': if (host && r.phase === 'final') r.backToLobby(); return;
      case 'cued': r.cuedBy(conn); return;
      case 'singerReady': r.singerReadyBy(conn); return;
      case 'react': r.reactBy(conn.id, msg.kind); return;
      case 'power': { const err = r.usePower(conn.id, Number(msg.card)); if (err) conn.error(err); return; }
      case 'vote': r.vote(conn.id, msg.v); return;
      case 'pickSong': r.pickVote(conn.id, Number(msg.i)); return;
      case 'vrtt': { const p = r.player(conn.id); const v = Number(msg.ms); if (p && v >= 0 && v < 2000) p.vrtt = Math.round(v); return; }
    }
  }
}
