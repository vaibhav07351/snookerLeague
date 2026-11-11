import { describe, expect, it } from '@jest/globals';

import { computeRatings } from '@/features/stats/services/rating.service';
import { leagueRecords } from '@/features/stats/services/records.service';
import { match, player } from '@/features/stats/services/stats-fixtures';

describe('leagueRecords', () => {
  it('names the holder of each record', () => {
    const a = player('a', 'Aman');
    const b = player('b', 'Bina');
    a.stats.standard.highestBreak = 87;
    b.stats.standard.highestBreak = 42;
    b.stats.standard.centuries = 1;
    a.stats.standard.fastestFrameSeconds = 600;
    b.stats.standard.fastestFrameSeconds = 420;
    a.stats.race.mostRedsInRace = 2;
    b.stats.race.mostRedsInRace = 4;
    const ratings = computeRatings(
      [match(['a'], ['b'], { day: 1 }), match(['a'], ['b'], { day: 2 })],
      [],
    );
    const byKey = new Map(leagueRecords([a, b], ratings).map((r) => [r.key, r]));
    expect(byKey.get('highestBreak')?.holderName).toBe('Aman');
    expect(byKey.get('highestBreak')?.value).toBe('87');
    expect(byKey.get('centuries')?.holderName).toBe('Bina');
    expect(byKey.get('fastestFrame')?.holderName).toBe('Bina');
    expect(byKey.get('mostRedsInRace')?.holderName).toBe('Bina');
    expect(byKey.get('mostRedsInRace')?.value).toBe('4 reds');
    expect(byKey.get('bestStreak')?.value).toBe('2 wins');
    expect(byKey.get('peakRating')?.holderName).toBe('Aman');
  });

  it('leaves records empty when nobody holds them', () => {
    const records = leagueRecords([player('a')], computeRatings([], []));
    expect(records.every((r) => r.holderId === null && r.value === '-')).toBe(true);
  });
});
