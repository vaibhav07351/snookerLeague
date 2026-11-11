/**
 * The rules that decide results, in plain words for a new player. Each screen shows the set
 * for its mode behind a "How it works" button. The wording must match what the services do:
 * match.service (best of, fouls, walkovers), group-frame-engine (free-for-all),
 * race-helpers / race.service (races), bracket (tournaments), profile.service (city rank).
 */

import { framesToWin } from '@/features/match/services/match.service';

export interface RuleSet {
  title: string;
  lines: string[];
}

/** 1 vs 1, doubles and 1 vs 2 frame matches. */
export function matchRules(bestOf: number, format: 'singles' | 'doubles' | 'one_vs_two'): RuleSet {
  const lines = [
    `Best of ${bestOf}: the first to win ${framesToWin(bestOf)} frames wins. The match ends as soon as someone gets there.`,
    'Foul: the foul points (4 to 7) go to the other side.',
    'At the end of each frame the scorer confirms who won it.',
    'Conceding gives the frame to the other side. If they can no longer be caught, the match ends as a walkover, which counts as half a win in ratings.',
  ];
  if (format === 'doubles') {
    lines.push('Doubles: partners share one score and share the rating change.');
  } else if (format === 'one_vs_two') {
    lines.push(
      '1 vs 2: the pair play as one side. Their rating is the average of the two, and a 1 vs 2 match cannot be a title match.',
    );
  }
  lines.push('A title match makes the winner the league champion.');
  return { title: 'How a match works', lines };
}

/** Free-for-all: 3 to 8 players, every player for themselves. */
export function freeForAllRules(bestOf: number): RuleSet {
  return {
    title: 'How free-for-all works',
    lines: [
      `Plays ${bestOf} ${bestOf === 1 ? 'frame' : 'frames'}, never more. It ends early once no one can catch the leader.`,
      'The highest score wins the frame. If players are level at the top, the scorer picks who took it.',
      "Foul: the points come off your own score. If you don't have enough, the rest goes to every other player.",
      'Match winner: most frames won. If level, most total points, then whoever won the latest frame.',
      'The break passes to the next player each frame.',
      "Free-for-all results don't change anyone's rating.",
    ],
  };
}

/** Races: first to the target score. */
export function raceRules(target: number): RuleSet {
  return {
    title: 'How a race works',
    lines: [
      `Race to ${target}: you finish when your score reaches ${target}. The first to get there takes 1st, the next 2nd, and so on.`,
      'A red is worth 10 in a race. The colours keep their usual values (yellow 2 up to black 7).',
      'Fouls are 4 or 10 points.',
      'Your score is points potted minus your fouls, so it can go below zero. The Fouls column shows how much you have given away.',
      'A foul only costs you. No one else gains points.',
      'Complete race: players still playing are placed by score. If level, fewer fouls goes ahead.',
      'Out: the player takes last place, and it still counts in ratings.',
      'In ratings a race counts as a result against every other player in it.',
    ],
  };
}

/** Tournaments: knockout or round robin, every fixture a best-of match. */
export function tournamentRules(format: 'knockout' | 'round_robin', bestOf: number): RuleSet {
  const each = `Every match is best of ${bestOf}: first to ${framesToWin(bestOf)} frames.`;
  if (format === 'knockout') {
    return {
      title: 'How a knockout works',
      lines: [
        each,
        'Win to go through to the next round. Lose once and you are out.',
        'Top seeds are kept apart until late. When the numbers are uneven, top seeds skip round 1 (a bye).',
        'If a result is changed after the next round has started, that next match is played again with the right player.',
      ],
    };
  }
  return {
    title: 'How a round robin works',
    lines: [
      each,
      'Everyone plays everyone once.',
      'A win is worth 2 points. The table is ordered by points.',
      'Level on points: frame difference (frames won minus frames lost), then frames won, then seed.',
    ],
  };
}

/** City boards and challenges. */
export function cityRules(minGames: number): RuleSet {
  return {
    title: 'How the city board works',
    lines: [
      'Ranked by win % and games played together, so a player with more games can rank above a higher win %.',
      `You need ${minGames} games in the city to be ranked.`,
      'Players under 18 are not shown on public city boards.',
      'Challenges are singles, best of 5, against a player in your city. The result counts on the city board.',
    ],
  };
}
