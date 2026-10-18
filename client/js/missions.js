/**
 * Crowd missions, shared by the server (rules) and the browser (the mission card).
 *
 * While someone sings, everyone else in the crowd gets one secret mission. Pull it off and it pays
 * out on the spot. Every mission is done with reactions, cards or your vote, so nobody has to talk.
 *
 * goal  - how many times it has to happen
 * on    - which reactions count ('any' for all of them)
 * when  - 'last10': only in the song's last ten seconds
 * needs - 'tomatoes' (the room allows tomatoes) or 'sab' (you hold a sabotage card)
 */
export const MISSIONS = {
  hype: { goal: 6, on: ['clap', 'fire'], pts: 10, name: 'HYPE MACHINE', icon: 'hands-clapping', line: 'Cheer them on 6 times.' },
  comedy: { goal: 4, on: ['laugh'], pts: 10, name: 'COMEDY CLUB', icon: 'smiley', line: 'Laugh 4 times.' },
  food: { goal: 4, on: ['tomato'], pts: 10, needs: 'tomatoes', name: 'FOOD FIGHT', icon: 'hand-pointing', line: 'Land 4 tomatoes.' },
  first: { goal: 1, on: ['any'], pts: 10, race: true, name: 'FIRST FAN', icon: 'flag-checkered', line: 'React before anyone else does.' },
  finale: { goal: 3, on: ['any'], when: 'last10', pts: 10, name: 'BIG FINISH', icon: 'confetti', line: 'React 3 times in the last 10 seconds.' },
  mix: { goal: 4, on: ['any'], distinct: true, pts: 10, name: 'FULL REVIEW', icon: 'squares-four', line: 'Use every reaction at least once.' },
  chaos: { goal: 1, pts: 15, needs: 'sab', name: 'CHAOS AGENT', icon: 'bomb', line: 'Play a sabotage card on this song.' },
  psychic: { goal: 1, pts: 15, name: 'MIND READER', icon: 'eye', line: 'Vote the exact score the crowd gives (rounded).' },
};
