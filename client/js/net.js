/**
 * The game connection: a WebSocket that reconnects on its own, plus a clock synced to the
 * server's (NTP-style, keeping the lowest-latency samples) so every player schedules the song
 * against the same timeline.
 */
export function createNet({ hello, onMessage, onStatus }) {
  let ws = null;
  let retry = 0;
  let offset = 0;
  let samples = [];
  let syncTimer = 0;

  const send = (msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

  function ping() { send({ t: 'ping', c: Date.now() }); }
  function burst() { for (let i = 0; i < 6; i++) setTimeout(ping, i * 120); }

  function connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      retry = 0;
      send({ t: 'hello', ...hello() });
      burst();
      clearInterval(syncTimer);
      syncTimer = setInterval(burst, 15000);
      onStatus('open');
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') {
        const t = Date.now();
        const rtt = t - m.c;
        samples.push({ rtt, off: m.s - (m.c + t) / 2 });
        samples = samples.slice(-12);
        const best = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
        offset = best.reduce((s, x) => s + x.off, 0) / best.length;
        return;
      }
      if (m.t === 'welcome' || m.t === 'room') offset = offset || (m.serverNow ?? m.room?.serverNow) - Date.now();
      onMessage(m);
    };
    ws.onclose = (e) => {
      clearInterval(syncTimer);
      // 4000: the same player opened the game in another tab, which takes over
      if (e.code === 4000) { onStatus('replaced'); return; }
      onStatus('closed');
      setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
    };
  }

  return {
    connect,
    send,
    now: () => Date.now() + offset,
    rtt: () => (samples.length ? Math.min(...samples.map((s) => s.rtt)) : 0),
  };
}
