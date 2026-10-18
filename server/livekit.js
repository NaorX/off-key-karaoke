import crypto from 'node:crypto';

const b64url = (s) => Buffer.from(s).toString('base64url');

/**
 * A LiveKit access token (HS256 JWT) that lets one player join one voice room.
 * Signed here so the API secret never leaves this computer.
 */
export function liveKitToken({ apiKey, apiSecret, room, identity, name, ttlSeconds = 6 * 3600 }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 10,
    exp: now + ttlSeconds,
    jti: `${identity}-${now}`,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function liveKitConfig() {
  const url = process.env.LIVEKIT_URL || '';
  const apiKey = process.env.LIVEKIT_API_KEY || '';
  const apiSecret = process.env.LIVEKIT_API_SECRET || '';
  return { url, apiKey, apiSecret, ok: Boolean(url && apiKey && apiSecret) };
}
