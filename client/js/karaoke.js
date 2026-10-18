/**
 * The karaoke video: YouTube's official embedded player, kept in step with the room's timeline.
 *
 * Every player's video should be at
 *   song.start + (now - startAt) / 1000 + (time gained from "speed up" sabotage)
 * where `now` is the synced server clock minus this player's voice delay, so the crowd hears
 * the backing track at the same moment the singer's voice arrives over voice chat.
 */
let apiPromise = null;
export function loadYouTube() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(window.YT?.Player ? window.YT : null), 15000);
  });
  return apiPromise;
}

export const PLAYER_VARS = { controls: 0, disablekb: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, modestbranding: 1 };

/** Seconds the video is ahead of (or behind) plain playback: speed changes, plus Plot Twist jumps. */
export function speedShift(sabs, t) {
  let s = 0;
  for (const x of sabs || []) {
    if (x.rate && x.rate !== 1) s += ((x.rate - 1) * Math.min(Math.max(t - x.at, 0), x.until - x.at)) / 1000;
    if (x.jump && t >= x.at) s += x.jump;
  }
  return s;
}

export function createKaraoke(elementId, { onError }) {
  let YT = null;
  let player = null;
  let ready = false;
  let job = null;          // { song, state: 'preparing' | 'cued' | 'done', onCued }
  let rate = 1;
  let lastCheck = 0;
  let lastVol = -1;

  async function init() {
    YT = await loadYouTube();
    if (!YT) return false;
    await new Promise((resolve) => {
      player = new YT.Player(elementId, {
        width: '100%',
        height: '100%',
        playerVars: { ...PLAYER_VARS, origin: location.origin },
        events: {
          onReady: () => { ready = true; resolve(); },
          onStateChange: (e) => onState(e.data),
          onError: (e) => {
            const why = e.data === 101 || e.data === 150 ? 'This video can’t play outside YouTube.' : 'This video couldn’t load.';
            onError?.(why);
            if (job && job.state === 'preparing') markCued();
          },
        },
      });
    });
    return true;
  }

  function markCued() {
    if (!job || job.state !== 'preparing') return;
    job.state = 'cued';
    clearTimeout(job.timeout);
    job.onCued?.();
  }

  function onState(s) {
    if (!job || job.state !== 'preparing') return;
    // Buffer the song by letting it start (muted), then park it on the start frame
    if (s === YT.PlayerState.PLAYING && player.getCurrentTime() >= job.song.start - 2) {
      player.pauseVideo();
      player.seekTo(job.song.start, true);
      markCued();
    }
  }

  return {
    init,
    isReady: () => ready,
    prepare(song, onCued) {
      job = { song, state: 'preparing', onCued };
      rate = 1;
      lastVol = -1;
      if (!ready) { markCued(); return; }
      player.mute();
      player.setPlaybackRate(1);
      player.loadVideoById({ videoId: song.videoId, startSeconds: song.start });
      job.timeout = setTimeout(markCued, 10000);
    },
    /** Called every frame while a song is on. */
    run({ now, startAt, endAt, sabs, volume }) {
      if (!ready || !job || job.state === 'preparing') return;
      const song = job.song;
      if (now < startAt) {
        if (player.getPlayerState() === YT.PlayerState.PLAYING) { player.pauseVideo(); player.seekTo(song.start, true); }
        return;
      }
      if (now >= endAt) {
        if (job.state !== 'done') { player.pauseVideo(); job.state = 'done'; }
        return;
      }
      const speeding = (sabs || []).find((x) => x.rate && x.rate !== 1 && now >= x.at && now < x.until);
      const muting = (sabs || []).some((x) => x.kind === 'mute' && now >= x.at && now < x.until);
      const want = speeding ? speeding.rate : 1;
      if (want !== rate) { rate = want; player.setPlaybackRate(want); }
      const fade = Math.min(1, (now - startAt) / 400, (endAt - now) / 1500);
      const vol = Math.round((muting ? 0 : volume) * Math.max(0, fade) * 100);
      if (vol !== lastVol) {
        lastVol = vol;
        player.setVolume(vol);
        if (vol > 0 && player.isMuted()) player.unMute();
      }
      const st = player.getPlayerState();
      if (st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING) player.playVideo();
      if (now - lastCheck > 500 && !speeding) {
        lastCheck = now;
        const expected = song.start + (now - startAt) / 1000 + speedShift(sabs, now);
        const drift = player.getCurrentTime() - expected;
        if (Math.abs(drift) > 0.3) player.seekTo(expected, true);
      }
    },
    stop() {
      if (ready && job) { player.pauseVideo(); player.mute(); }
      job = null;
    },
    current: () => job?.song || null,
    duration: () => (ready && player.getDuration ? player.getDuration() : 0),
  };
}
