import type { TourId, TourScript } from '@/features/tour/types/tour.types';

/** All tour copy in one place. Steps whose target is not on screen are skipped. */
export const TOUR_SCRIPTS: Record<TourId, TourScript> = {
  'whats-new': {
    id: 'whats-new',
    next: 'home',
    skipLabel: 'Not now',
    steps: [
      {
        targetId: null,
        icon: 'sparkles',
        title: 'New: a quick tour',
        body: 'Take 30 seconds to see where everything lives. You can replay it anytime from Settings.',
        primaryLabel: 'Show me around',
      },
    ],
  },
  home: {
    id: 'home',
    steps: [
      {
        targetId: 'home.getting-started',
        icon: 'checkmark-done-outline',
        title: 'Your first steps',
        body: 'This checklist ticks itself off as you go. Tap any step to jump straight to it.',
      },
      {
        targetId: 'home.start-match',
        icon: 'play',
        title: 'Start a match',
        body: 'Singles or doubles. Pick the players and score it live, ball by ball. The app does the maths.',
      },
      {
        targetId: 'home.log-race',
        icon: 'flag-outline',
        title: 'Log a race',
        body: 'Everyone races to a target score. Great for a group night with more than four players.',
      },
      {
        targetId: 'home.feed',
        icon: 'pulse-outline',
        title: 'Your feed',
        body: 'Live games and fresh results from your league and friends. Use the chips to narrow it down.',
      },
      {
        targetId: 'nav.tabs',
        icon: 'apps-outline',
        title: 'One tap away',
        body: 'Looking finds a game near you, My Snooker holds your club tools, Community shows your city, and Profile is you.',
      },
      {
        targetId: 'nav.menu',
        icon: 'menu',
        title: 'The full menu',
        body: 'History, champions, stats, leaderboard, players and league settings all live here.',
        primaryLabel: "Let's play",
      },
    ],
  },
  'match-new': {
    id: 'match-new',
    steps: [
      {
        targetId: 'match-new.format',
        icon: 'people-outline',
        title: 'Singles or doubles',
        body: 'Choose 1 v 1 or 2 v 2 first. It sets how many players each side needs.',
      },
      {
        targetId: 'match-new.sides',
        icon: 'hand-left-outline',
        title: 'Tap to pick sides',
        body: 'Tap players below: the first fill Side A, the rest Side B. Tap a name again to take it out.',
      },
      {
        targetId: 'match-new.extras',
        icon: 'options-outline',
        title: 'Title match or mid-match',
        body: 'Make the winner league champion, or say you are already playing to enter the score so far.',
      },
      {
        targetId: 'match-new.start',
        icon: 'play',
        title: 'Break off',
        body: 'Once both sides are full, start the match and the scoreboard opens.',
        primaryLabel: 'Got it',
      },
    ],
  },
  'live-scoring': {
    id: 'live-scoring',
    steps: [
      {
        targetId: 'live.players',
        icon: 'person-circle-outline',
        title: 'Who is at the table',
        body: 'The highlighted side is playing. Tap a name to change who is at the table.',
      },
      {
        targetId: 'live.balls',
        icon: 'ellipse',
        title: 'Tap a ball when it is potted',
        body: 'Glowing balls are the ones "on". Every pot adds to the break and the score.',
      },
      {
        targetId: 'live.actions',
        icon: 'swap-horizontal-outline',
        title: 'End the visit',
        body: 'Miss or Safety hands the table over. Made a mistake? Undo fixes the last shot.',
      },
      {
        targetId: 'live.fouls',
        icon: 'warning-outline',
        title: 'Fouls',
        body: 'Tap the foul value and the points go to the other side.',
      },
      {
        targetId: 'live.frame',
        icon: 'trophy-outline',
        title: 'Close the frame',
        body: 'When a frame is decided, tap the winner. The frame clock starts on the first shot.',
        primaryLabel: "Let's play",
      },
    ],
  },
  league: {
    id: 'league',
    steps: [
      {
        targetId: 'league.list',
        icon: 'trophy-outline',
        title: 'Your leagues',
        body: 'Each league has its own players, matches and champions. Make one active to switch.',
      },
      {
        targetId: 'league.invite',
        icon: 'share-social-outline',
        title: 'Bring your friends in',
        body: 'Share the link. Friends sign in, pick their player and keep any history you logged for them.',
        primaryLabel: 'Got it',
      },
    ],
  },
  players: {
    id: 'players',
    steps: [
      {
        targetId: 'players.add',
        icon: 'person-add-outline',
        title: 'Add everyone at the table',
        body: "Guests don't need the app. They can claim their card later and keep their stats.",
        primaryLabel: 'Got it',
      },
    ],
  },
};

/** The tour and every tour chained after it, in play order. */
export function tourChain(id: TourId): TourId[] {
  const chain: TourId[] = [];
  let current: TourId | undefined = id;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = TOUR_SCRIPTS[current].next;
  }
  return chain;
}
