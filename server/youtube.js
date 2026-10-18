/**
 * YouTube helpers that need no API key: video ids from links, and title/channel/embeddability
 * from YouTube's public oEmbed endpoint (it answers 401 when the owner has disabled embedding).
 */

export function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** A start time from a link's t= / start= parameter ("95", "1m35s"), in seconds. */
export function parseStart(input) {
  const m = String(input || '').match(/[?&#](?:t|start)=([\dhms]+)/);
  if (!m) return 0;
  const v = m[1];
  if (/^\d+$/.test(v)) return Number(v);
  const h = /(\d+)h/.exec(v), mi = /(\d+)m/.exec(v), se = /(\d+)s/.exec(v);
  return (h ? +h[1] * 3600 : 0) + (mi ? +mi[1] * 60 : 0) + (se ? +se[1] : 0);
}

const KARAOKE_WORDS = /karaoke|קריוקי|instrumental|backing track|sing ?along|minus ?one|lyrics|פלייבק|off ?vocal/i;
const cache = new Map();

export async function resolveVideo(input) {
  const videoId = parseVideoId(input);
  if (!videoId) return { ok: false, reason: 'That doesn’t look like a YouTube link.' };
  if (cache.has(videoId)) return { ...cache.get(videoId), start: parseStart(input) };
  let res;
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, reason: 'Couldn’t reach YouTube. Check your internet and try again.' };
  }
  let out;
  if (res.status === 401 || res.status === 403) {
    out = { ok: false, videoId, reason: 'The owner of this video doesn’t allow it to play outside YouTube. Try another karaoke channel.' };
  } else if (!res.ok) {
    out = { ok: false, videoId, reason: 'Video not found. It may be private or deleted.' };
  } else {
    const j = await res.json();
    out = {
      ok: true,
      videoId,
      title: String(j.title || '').slice(0, 140),
      channel: String(j.author_name || '').slice(0, 80),
      thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      karaoke: KARAOKE_WORDS.test(`${j.title} ${j.author_name}`),
    };
  }
  cache.set(videoId, out);
  return { ...out, start: parseStart(input) };
}
