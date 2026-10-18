/**
 * Voice chat over LiveKit (an SFU: every player sends one stream, the server fans it out).
 *
 * Two mic modes:
 *   chat  - speech settings: echo cancellation, noise suppression, auto gain. Opus with DTX + RED.
 *   stage - music settings for the singer: all processing off (it eats singing), higher bitrate,
 *           no DTX so held notes never get gated. Needs headphones.
 */
import { Room, RoomEvent, Track, AudioPresets, createLocalAudioTrack } from 'livekit-client';

export function createVoice({ onState, onSpeakers }) {
  let room = null;
  let mode = 'chat';
  let muted = false;
  let deviceId = localStorage.getItem('offkey.mic') || undefined;
  let peerVolume = 1;
  let duck = new Map();
  let joining = null;
  let localTrack = null;
  let state = 'off';
  const jitterPrev = new Map();
  // Levels measured right here from each incoming audio track, so "who's talking" lines up with what we hear
  let levelCtx = null;
  const meters = new Map();
  let personalMute = new Set();
  let crowd = new Map();
  const chains = new Map();
  let impulse = null;
  /** A small-room reverb tail: decaying stereo noise. */
  function reverbImpulse(ctx) {
    if (impulse) return impulse;
    const len = Math.floor(ctx.sampleRate * 1.6);
    impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return impulse;
  }
  /** "Distant crowd": thin it out, roll off the highs, and push it back into the room with reverb. */
  function distantChain(identity) {
    if (chains.has(identity)) return chains.get(identity);
    const ctx = levelCtx;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    const dry = ctx.createGain(); dry.gain.value = 0.55;
    const out = ctx.createGain(); out.gain.value = 1;
    const verb = ctx.createConvolver(); verb.buffer = reverbImpulse(ctx);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    dry.connect(verb).connect(wet).connect(out);
    const nodes = [hp, lp, dry, out];
    chains.set(identity, nodes);
    return nodes;
  }
  /** "Echo Chamber": the dry voice plus a feedback delay (each echo quieter than the last). */
  let echoId = null;
  const echoChains = new Map();
  function echoChain(identity) {
    if (echoChains.has(identity)) return echoChains.get(identity);
    const ctx = levelCtx;
    const inp = ctx.createGain();
    const out = ctx.createGain();
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    const wet = ctx.createGain(); wet.gain.value = 0.6;
    inp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(out);
    const nodes = [inp, out];
    echoChains.set(identity, nodes);
    return nodes;
  }
  /** "Robot Voice": a ring modulator (the voice multiplied by a low tone). */
  function robotChain() {
    const ctx = levelCtx;
    const mod = ctx.createGain(); mod.gain.value = 0;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 62;
    osc.connect(mod.gain);
    osc.start();
    const out = ctx.createGain(); out.gain.value = 1.6;
    return [mod, out];
  }
  /** "Megaphone": a narrow, crunchy band like a cheap horn speaker. */
  function megaphoneChain() {
    const ctx = levelCtx;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1500; peak.gain.value = 9;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 6) * 0.7; }
    shaper.curve = curve;
    const out = ctx.createGain(); out.gain.value = 0.9;
    return [hp, lp, peak, shaper, out];
  }
  /**
   * The singer's voice, mixed to sit on top of the music: low rumble cut, a lift where the voice
   * carries (the band the backing track leaves room for), a compressor so quiet lines stay as
   * present as loud ones, then makeup gain.
   */
  let singerId = null;
  const vocalChains = new Map();
  function vocalChain(identity) {
    if (vocalChains.has(identity)) return vocalChains.get(identity);
    const ctx = levelCtx;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 320; mud.Q.value = 1; mud.gain.value = -2.5;
    const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3000; presence.Q.value = 0.8; presence.gain.value = 4.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    const makeup = ctx.createGain(); makeup.gain.value = 2.1;
    const nodes = [hp, mud, presence, comp, makeup];
    vocalChains.set(identity, nodes);
    return nodes;
  }
  let fxKind = null;
  let fxChain = null;
  function applyCrowd() {
    if (!room || !levelCtx) return;
    for (const p of room.remoteParticipants.values()) {
      const mode = crowd.get(p.identity);
      const chain = p.identity === singerId ? [...(p.identity === echoId ? fxChain : []), ...vocalChain(p.identity)]
        : p.identity === echoId ? fxChain : mode === 'distant' ? distantChain(p.identity) : [];
      for (const pub of p.audioTrackPublications.values()) pub.track?.setWebAudioPlugins?.(chain);
    }
  }
  function meter(identity, mediaStreamTrack) {
    try {
      levelCtx ||= new AudioContext();
      if (levelCtx.state !== 'running') levelCtx.resume();
      const src = levelCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      const analyser = levelCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      meters.set(identity, { analyser, buf: new Float32Array(512) });
    } catch {}
  }

  const set = (s, detail) => { state = s; onState(s, detail); };

  function applyVolumes() {
    if (!room) return;
    const CROWD_VOLUME = { off: 0, distant: 0.55, live: 0.85 };
    for (const p of room.remoteParticipants.values()) {
      const mode = crowd.get(p.identity);
      p.setVolume(personalMute.has(p.identity) ? 0 : peerVolume * (duck.get(p.identity) ?? 1) * (mode ? CROWD_VOLUME[mode] : 1));
    }
  }

  async function publish() {
    if (!room) return;
    const old = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (old?.track) await room.localParticipant.unpublishTrack(old.track, true);
    localTrack = null;
    const stage = mode === 'stage';
    try {
      localTrack = await createLocalAudioTrack({
        deviceId,
        echoCancellation: !stage,
        noiseSuppression: !stage,
        autoGainControl: !stage,
        channelCount: 1,
      });
    } catch (err) {
      set('nomic', err?.name === 'NotAllowedError' ? 'Microphone blocked. Allow it in the address bar, then reload.' : 'No microphone found.');
      return;
    }
    await room.localParticipant.publishTrack(localTrack, {
      source: Track.Source.Microphone,
      audioPreset: stage ? AudioPresets.musicHighQuality : AudioPresets.speech,
      dtx: !stage,
      red: true,
    });
    if (muted) await localTrack.mute();
    set('on');
  }

  async function join({ playerId, secret }) {
    if (joining) return joining;
    joining = (async () => {
      set('connecting');
      let cfg;
      try {
        const res = await fetch('/api/voice-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, secret }) });
        cfg = await res.json();
        if (!res.ok) throw new Error(cfg.error || 'Voice is unavailable.');
      } catch (err) {
        set('error', err.message);
        joining = null;
        return;
      }
      levelCtx ||= new AudioContext();
      room = new Room({
        // Remote voices play through our AudioContext so we can shape them (the distant-crowd effect)
        webAudioMix: { audioContext: levelCtx },
        adaptiveStream: false,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.dataset.peer = participant.identity;
        document.body.appendChild(el);
        meter(participant.identity, track.mediaStreamTrack);
        applyCrowd();
        applyVolumes();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => { track.detach().forEach((el) => el.remove()); meters.delete(participant.identity); });
      room.on(RoomEvent.ParticipantConnected, applyVolumes);
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => onSpeakers(speakers.map((p) => p.identity)));
      room.on(RoomEvent.Reconnecting, () => set('reconnecting'));
      room.on(RoomEvent.Reconnected, () => set(localTrack ? 'on' : 'nomic'));
      room.on(RoomEvent.Disconnected, () => { if (room) set('off'); });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!room.canPlaybackAudio) set('blocked', 'Click anywhere to turn on voice.'); });
      try {
        await room.connect(cfg.url, cfg.token);
        await room.startAudio().catch(() => {});
        await publish();
      } catch (err) {
        set('error', 'Couldn’t connect to voice. Check your internet.');
        room = null;
      }
      joining = null;
    })();
    return joining;
  }

  return {
    join,
    async leave() {
      const r = room;
      room = null;
      localTrack = null;
      document.querySelectorAll('audio[data-peer]').forEach((el) => el.remove());
      meters.clear();
      if (r) await r.disconnect();
      set('off');
    },
    async setMode(m) {
      if (m === mode) return;
      mode = m;
      if (room && state !== 'nomic') await publish();
    },
    async setMuted(m) {
      muted = m;
      if (localTrack) await (m ? localTrack.mute() : localTrack.unmute());
    },
    isMuted: () => muted,
    async setDevice(id) {
      deviceId = id || undefined;
      localStorage.setItem('offkey.mic', id || '');
      if (room) await publish();
    },
    setPeerVolume(v) { peerVolume = v; applyVolumes(); },
    /** Per-player volume multipliers, e.g. turning the crowd down while someone sings. */
    setDuck(map) { duck = map; applyVolumes(); },
    resumeAudio() { room?.startAudio().catch(() => {}); },
    /** Instant loudness (0..1) of a remote player, measured from the audio we're actually playing. */
    liveLevel(identity) {
      const m = meters.get(identity);
      if (!m || personalMute.has(identity)) return 0;
      m.analyser.getFloatTimeDomainData(m.buf);
      let s = 0;
      for (let i = 0; i < m.buf.length; i++) s += m.buf[i] * m.buf[i];
      return Math.min(1, Math.sqrt(s / m.buf.length) * 7);
    },
    setPersonalMute(set) { personalMute = set; applyVolumes(); },
    /** While someone sings: each crowd member's voice is 'off', 'distant' (quiet, filtered, roomy) or 'live'. */
    setCrowd(map) { crowd = map; applyVolumes(); applyCrowd(); },
    /** Who's on stage right now (their voice gets the vocal mix), or null between songs. */
    setSinger(identity) {
      if (identity === singerId) return;
      singerId = identity;
      applyCrowd();
    },
    /** Put a voice effect ('echo', 'robot', 'megaphone') on one player (the singer), or clear it with null. */
    setVoiceFx(identity, kind) {
      if (!levelCtx) return;
      echoId = identity && kind ? identity : null;
      if (echoId && kind !== fxKind) {
        if (kind === 'mute') { const g = levelCtx.createGain(); g.gain.value = 0; fxChain = [g]; }
        else fxChain = kind === 'echo' ? echoChain(identity) : kind === 'robot' ? robotChain() : megaphoneChain();
      }
      fxKind = echoId ? kind : null;
      applyCrowd();
    },
    level(identity) {
      if (!room) return 0;
      if (identity === room.localParticipant.identity) return muted ? 0 : room.localParticipant.audioLevel;
      return room.remoteParticipants.get(identity)?.audioLevel ?? 0;
    },
    /**
     * Live latency numbers from WebRTC: our round trip to the voice server, and how long the
     * singer's audio currently waits in our jitter buffer (averaged since the last call).
     */
    async measure(singerIdentity) {
      if (!room) return null;
      let rtt = null, jitter = null;
      const read = (report, key) => {
        report?.forEach((s) => {
          if (s.type === 'candidate-pair' && s.nominated && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime * 1000;
          if (key && s.type === 'inbound-rtp' && s.kind === 'audio' && s.jitterBufferEmittedCount) {
            const prev = jitterPrev.get(key);
            const dDelay = s.jitterBufferDelay - (prev?.delay ?? 0);
            const dCount = s.jitterBufferEmittedCount - (prev?.count ?? 0);
            if (dCount > 0) jitter = (dDelay / dCount) * 1000;
            jitterPrev.set(key, { delay: s.jitterBufferDelay, count: s.jitterBufferEmittedCount });
          }
        });
      };
      try {
        if (localTrack) read(await localTrack.getRTCStatsReport());
        const singer = singerIdentity && room.remoteParticipants.get(singerIdentity);
        const pub = singer ? [...singer.audioTrackPublications.values()].find((p) => p.track) : null;
        if (pub) read(await pub.track.getRTCStatsReport(), singerIdentity);
      } catch {}
      return { rtt, jitter };
    },
    /** Live mic level (0..1) straight from the local track, for meters. */
    localTrack: () => localTrack,
    state: () => state,
  };
}
