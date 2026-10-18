/**
 * Power-up cards, shared by the server (rules) and the browser (cards, icons, effects).
 *
 * type:
 *   instant - points won, lost or stolen: added (secretly) on top of your next song's score
 *   sab     - played by hand on someone else's song while they sing
 *   self    - automatic: kicks in on your next song
 *   vote    - automatic: kicks in on your next vote
 * w is how often it comes out of the Lucky Draw (higher = more common).
 */
export const POWERS = {
  jackpot: { type: 'instant', pts: 50, w: 3, tier: 'gold', name: 'JACKPOT', icon: 'coins', line: '+50 on top of your next song.' },
  bonus20: { type: 'instant', pts: 20, w: 8, tier: 'good', name: '+20 POINTS', icon: 'hand-coins', line: '+20 on top of your next song.' },
  bonus10: { type: 'instant', pts: 10, w: 11, tier: 'good', name: '+10 POINTS', icon: 'coin', line: '+10 on top of your next song.' },
  pickpocket: { type: 'instant', steal: 15, w: 5, tier: 'good', name: 'PICKPOCKET', icon: 'hand-grabbing', line: 'Steals 15 from the leader after your next song.', later: true },
  bust: { type: 'instant', pts: -15, w: 5, tier: 'bad', name: 'BAD LUCK', icon: 'smiley-x-eyes', line: 'Your next song loses 15 points. Ouch.', later: true },
  dud: { type: 'instant', pts: 0, w: 4, tier: 'bad', name: 'EMPTY BOX', icon: 'package', line: 'Nothing inside. Next time!' },

  lights: { type: 'sab', ms: 5000, w: 9, name: 'LIGHTS OUT', icon: 'moon-stars', line: 'Plunges the stage into darkness.' },
  mute: { type: 'sab', ms: 4000, w: 9, name: 'MUTE MUSIC', icon: 'speaker-slash', line: 'Kills the backing track. A cappella!' },
  speed: { type: 'sab', ms: 4500, rate: 1.3, w: 9, name: 'SPEED UP', icon: 'fast-forward', line: 'Cranks the song up to 1.3x.' },
  slow: { type: 'sab', ms: 5000, rate: 0.75, w: 8, name: 'SLOW-MO', icon: 'hourglass-medium', line: 'Drags the song down to 0.75x.' },
  fog: { type: 'sab', ms: 5500, w: 8, name: 'FOG MACHINE', icon: 'cloud-fog', line: 'The lyrics vanish in smoke.' },
  echo: { type: 'sab', ms: 6000, w: 7, name: 'ECHO CHAMBER', icon: 'waveform', line: 'Their voice echoes, echoes, echoes.' },
  storm: { type: 'sab', ms: 2600, hype: -0.15, w: 7, name: 'TOMATO STORM', icon: 'cloud-rain', line: 'Eight tomatoes. One target.' },
  disco: { type: 'sab', ms: 7000, w: 6, name: 'DISCO FEVER', icon: 'disco-ball', line: 'The club lights take over the stage.' },
  mirror: { type: 'sab', ms: 6000, w: 7, name: 'MIRROR MODE', icon: 'flip-horizontal', line: 'The lyrics flip backwards.' },
  quake: { type: 'sab', ms: 4500, w: 7, name: 'EARTHQUAKE', icon: 'vibrate', line: 'The whole stage shakes.' },
  shrink: { type: 'sab', ms: 6000, w: 6, name: 'SHRINK RAY', icon: 'arrows-in', line: 'The lyrics shrink to tiny.' },
  skip: { type: 'sab', ms: 600, jump: 15, w: 6, name: 'PLOT TWIST', icon: 'skip-forward', line: 'Jumps the song ahead 15 seconds.' },
  robot: { type: 'sab', ms: 6000, w: 7, name: 'ROBOT VOICE', icon: 'robot', line: 'Their voice turns robotic.' },
  megaphone: { type: 'sab', ms: 6000, w: 7, name: 'MEGAPHONE', icon: 'megaphone', line: 'They sound like a cheap megaphone.' },
  bonk: { type: 'sab', ms: 4700, hit: 1100, w: 8, name: 'SQUEAKY HAMMER', icon: 'hammer', line: 'Hop on stage and bonk them. Muted for 3.5s.' },
  bubbles: { type: 'sab', ms: 6500, w: 6, name: 'BUBBLE MACHINE', icon: 'circles-three', line: 'Bubbles float over the lyrics.' },

  double: { type: 'self', w: 5, name: 'DOUBLE UP', icon: 'number-square-two', line: 'Your next song scores double. Automatic.' },
  shield: { type: 'self', w: 6, name: 'BODYGUARD', icon: 'shield-check', line: 'Blocks every sabotage on your next song. Automatic.' },

  golden: { type: 'vote', w: 5, name: 'GOLDEN VOTE', icon: 'crown-simple', line: 'Your next vote counts triple. Automatic.' },
};

export const CLASSIC_HAND = ['lights', 'mute', 'speed'];
export const HAND_MAX = 3;

/** When and how a card is played, in words for the card's tag. */
export const USE_TEXT = { sab: 'SABOTAGE', self: 'AUTO: YOUR SONG', vote: 'AUTO: YOUR VOTE', instant: 'AUTO: YOUR SCORE' };

/** A weighted random card. Cards marked `later` only show up once there are points to win or lose. */
export function drawCard(firstRound, rnd = Math.random) {
  const pool = Object.entries(POWERS).filter(([, p]) => !(firstRound && p.later));
  let r = rnd() * pool.reduce((s, [, p]) => s + p.w, 0);
  for (const [k, p] of pool) if ((r -= p.w) <= 0) return k;
  return pool[0][0];
}
