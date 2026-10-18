/**
 * Synthesized sound: UI clicks, crowd reactions, stingers, and a soft lounge loop for the
 * menu and lobby. Nothing to download, and it stays out of the way of the YouTube audio.
 */
const A = { ctx: null, master: null, sfx: null, music: null, noise: null, vol: 0.8, lounge: 0, loungeOn: false };
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function ensureAudio() {
  if (A.ctx) { if (A.ctx.state !== 'running') A.ctx.resume(); return A.ctx; }
  const ctx = new AudioContext();
  A.ctx = ctx;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  A.master = ctx.createGain();
  A.master.gain.value = A.vol;
  A.master.connect(comp).connect(ctx.destination);
  A.sfx = ctx.createGain(); A.sfx.gain.value = 0.7; A.sfx.connect(A.master);
  A.music = ctx.createGain(); A.music.gain.value = 0.45; A.music.connect(A.master);
  const len = ctx.sampleRate;
  A.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = A.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  A.lounge = ctx.currentTime + 0.1;
  return ctx;
}
export function setSfxVolume(v) { A.vol = v; if (A.master) A.master.gain.value = v; }
export const audioContext = () => A.ctx;
const on = () => A.ctx && A.ctx.state === 'running' && A.vol > 0;

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(type, freq, t, dur, peak, { a = 0.005, dest = A.sfx, filter } = {}) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, a, peak, dur);
  if (filter) {
    const f = A.ctx.createBiquadFilter();
    f.type = filter[0]; f.frequency.value = filter[1]; if (filter[2]) f.Q.value = filter[2];
    o.connect(f).connect(g);
  } else o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}
function hiss(t, dur, peak, type = 'highpass', freq = 6000, dest = A.sfx, q = 0.7) {
  const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
  s.buffer = A.noise;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, 0.003, peak, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, rand(0, 0.5));
  s.stop(t + dur + 0.05);
  return f;
}

export const sfx = {
  click() { if (!on()) return; const t = A.ctx.currentTime; tone('sine', 900, t, 0.06, 0.16); tone('sine', 1400, t + 0.02, 0.05, 0.08); },
  hover() { if (!on()) return; tone('sine', 1700, A.ctx.currentTime, 0.03, 0.022); },
  whoosh() { if (!on()) return; const t = A.ctx.currentTime; const f = hiss(t, 0.45, 0.22, 'bandpass', 500, A.sfx, 1.5); f.frequency.exponentialRampToValueAtTime(4000, t + 0.4); },
  ding() { if (!on()) return; const t = A.ctx.currentTime; [76, 83, 88].forEach((m, i) => tone('triangle', mtof(m), t + i * 0.09, 0.5, 0.14)); },
  join() { if (!on()) return; const t = A.ctx.currentTime; tone('triangle', mtof(72), t, 0.15, 0.12); tone('triangle', mtof(79), t + 0.1, 0.25, 0.12); },
  leave() { if (!on()) return; const t = A.ctx.currentTime; tone('triangle', mtof(74), t, 0.15, 0.1); tone('triangle', mtof(67), t + 0.1, 0.25, 0.1); },
  tick(hi) { if (!on()) return; tone('square', hi ? 1320 : 880, A.ctx.currentTime, 0.05, 0.06, { filter: ['lowpass', 3000] }); },
  pop(f = 700) { if (!on()) return; const t = A.ctx.currentTime; const o = tone('sine', f, t, 0.12, 0.2); o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.08); },
  clap() { if (!on()) return; const t = A.ctx.currentTime; for (let i = 0; i < 4; i++) hiss(t + i * rand(0.03, 0.06), 0.06, 0.16, 'bandpass', 1500, A.sfx, 0.8); },
  laugh() { if (!on()) return; const t = A.ctx.currentTime; for (let i = 0; i < 4; i++) { const o = tone('sawtooth', 420 - i * 30, t + i * 0.09, 0.07, 0.06, { filter: ['bandpass', 900, 3] }); o.frequency.exponentialRampToValueAtTime(260, t + i * 0.09 + 0.07); } },
  fire() { if (!on()) return; const t = A.ctx.currentTime; const f = hiss(t, 0.5, 0.18, 'lowpass', 400); f.frequency.exponentialRampToValueAtTime(3000, t + 0.3); },
  throw() { if (!on()) return; const t = A.ctx.currentTime; const o = tone('sine', 300, t, 0.3, 0.05); o.frequency.exponentialRampToValueAtTime(900, t + 0.3); },
  splat() { if (!on()) return; const t = A.ctx.currentTime; hiss(t, 0.22, 0.45, 'lowpass', 900); const o = tone('sine', 160, t, 0.18, 0.45); o.frequency.exponentialRampToValueAtTime(50, t + 0.18); },
  lights() { if (!on()) return; const t = A.ctx.currentTime; tone('square', 120, t, 0.05, 0.2, { filter: ['lowpass', 900] }); const o = tone('sawtooth', 400, t + 0.05, 0.4, 0.08, { filter: ['lowpass', 1200] }); o.frequency.exponentialRampToValueAtTime(50, t + 0.45); },
  mute() { if (!on()) return; const t = A.ctx.currentTime; const o = tone('sine', 900, t, 0.3, 0.1); o.frequency.exponentialRampToValueAtTime(200, t + 0.3); },
  speed() { if (!on()) return; const t = A.ctx.currentTime; for (let i = 0; i < 6; i++) tone('square', mtof(64 + i * 3), t + i * 0.04, 0.05, 0.05, { filter: ['lowpass', 3000] }); },
  card(v) { if (!on()) return; const t = A.ctx.currentTime; hiss(t, 0.05, 0.25, 'bandpass', 2000); tone('triangle', mtof(60 + v * 3), t + 0.02, 0.25, 0.16); },
  cheer() { if (!on()) return; const t = A.ctx.currentTime; hiss(t, 1.6, 0.14, 'bandpass', 1400, A.sfx, 0.5); [72, 76, 79, 84].forEach((m, i) => tone('triangle', mtof(m), t + i * 0.08, 0.5, 0.12)); for (let i = 0; i < 12; i++) hiss(t + rand(0, 1.2), 0.05, 0.1, 'bandpass', 1500); },
  aww() { if (!on()) return; const t = A.ctx.currentTime; const o = tone('sawtooth', mtof(67), t, 1.1, 0.06, { a: 0.08, filter: ['lowpass', 1400] }); o.frequency.exponentialRampToValueAtTime(mtof(58), t + 1.1); },
  reel() { if (!on()) return; tone('triangle', 1900, A.ctx.currentTime, 0.025, 0.035, { filter: ['lowpass', 4000] }); },
  win() { if (!on()) return; const t = A.ctx.currentTime; [79, 84, 88].forEach((m, i) => tone('triangle', mtof(m), t + i * 0.07, 0.35, 0.13)); },
  bad() { if (!on()) return; const t = A.ctx.currentTime; tone('square', mtof(55), t, 0.16, 0.07, { filter: ['lowpass', 900] }); tone('square', mtof(49), t + 0.18, 0.4, 0.07, { filter: ['lowpass', 900] }); },
  slow() { if (!on()) return; const t = A.ctx.currentTime; const o = tone('sawtooth', 520, t, 0.7, 0.07, { filter: ['lowpass', 1200] }); o.frequency.exponentialRampToValueAtTime(110, t + 0.7); },
  fog() { if (!on()) return; const t = A.ctx.currentTime; const f = hiss(t, 1.3, 0.2, 'lowpass', 500); f.frequency.exponentialRampToValueAtTime(1600, t + 1.1); },
  echo() { if (!on()) return; const t = A.ctx.currentTime; for (let i = 0; i < 5; i++) tone('sine', 880, t + i * 0.17, 0.12, 0.14 * Math.pow(0.55, i)); },
  storm() { if (!on()) return; const t = A.ctx.currentTime; for (let i = 0; i < 6; i++) { const o = tone('sine', 280, t + i * 0.07, 0.25, 0.04); o.frequency.exponentialRampToValueAtTime(900, t + i * 0.07 + 0.25); } },
  disco() { if (!on()) return; const t = A.ctx.currentTime; [72, 76, 79, 83, 79, 76, 72, 79].forEach((m, i) => tone('square', mtof(m), t + i * 0.07, 0.07, 0.05, { filter: ['lowpass', 2600] })); },
  double() { if (!on()) return; const t = A.ctx.currentTime; [72, 79, 84, 91].forEach((m, i) => tone('triangle', mtof(m), t + i * 0.06, 0.32, 0.13)); },
  shield() { if (!on()) return; const t = A.ctx.currentTime; const o = tone('sine', 300, t, 0.3, 0.18); o.frequency.exponentialRampToValueAtTime(950, t + 0.28); tone('triangle', mtof(88), t + 0.24, 0.45, 0.1); },
  golden() { if (!on()) return; const t = A.ctx.currentTime; [84, 88, 91, 96].forEach((m, i) => tone('sine', mtof(m), t + i * 0.05, 0.5, 0.09)); },
  bonk() {
    if (!on()) return;
    const t = A.ctx.currentTime;
    // Rubber squeak, a soft thud, then a little boing
    for (const d of [0, 0.07]) { const o = tone('sine', 1300, t + d, 0.07, 0.12); o.frequency.exponentialRampToValueAtTime(2400, t + d + 0.06); }
    const th = tone('sine', 170, t, 0.22, 0.4); th.frequency.exponentialRampToValueAtTime(55, t + 0.2);
    const bo = tone('triangle', 260, t + 0.12, 0.5, 0.1); bo.frequency.exponentialRampToValueAtTime(520, t + 0.3); bo.frequency.exponentialRampToValueAtTime(300, t + 0.6);
  },
  fanfare() { if (!on()) return; const t = A.ctx.currentTime; [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [76, 0.36], [79, 0.36]].forEach(([m, d]) => tone('triangle', mtof(m), t + d, 0.8, 0.1)); },
};

/** Soft chords and a brushed beat at 84 BPM while nobody is singing. */
export function setLounge(v) { A.loungeOn = v; }
export function scheduleLounge() {
  if (!A.loungeOn || !on()) return;
  const bar = (60 / 84) * 4, now = A.ctx.currentTime;
  if (A.lounge < now) A.lounge = now + 0.05;
  while (A.lounge < now + 0.3) {
    const t = A.lounge, root = [48, 45, 41, 43][Math.round(t / bar) % 4];
    const third = root % 12 === 9 ? 3 : 4;
    [0, third, 7, 12].forEach((iv) => tone('triangle', mtof(root + 12 + iv), t, bar * 0.95, 0.024, { a: 0.25, dest: A.music, filter: ['lowpass', 1800] }));
    tone('sawtooth', mtof(root - 12), t, bar * 0.4, 0.16, { a: 0.01, dest: A.music, filter: ['lowpass', 480] });
    for (let b = 0; b < 4; b++) {
      hiss(t + (b + 0.5) * (bar / 4), 0.04, 0.045, 'highpass', 8000, A.music);
      if (b % 2 === 0) { const o = tone('sine', 140, t + b * (bar / 4), 0.3, 0.3, { dest: A.music }); o.frequency.exponentialRampToValueAtTime(42, t + b * (bar / 4) + 0.12); }
    }
    A.lounge += bar;
  }
}
