import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export interface FrameRankView {
  playerId: string;
  name: string;
  points: number;
  scored: number;
  foulPoints: number;
  place: number;
}

function ordinal(place: number): string {
  if (place === 1) {
    return '1st';
  }
  if (place === 2) {
    return '2nd';
  }
  if (place === 3) {
    return '3rd';
  }
  return `${place}th`;
}

interface FrameLiveRanksProps {
  ranks: FrameRankView[];
  wide?: boolean;
}

export function FrameLiveRanks({ ranks, wide = false }: FrameLiveRanksProps): ReactNode {
  if (ranks.length === 0) {
    return null;
  }
  const sorted = [...ranks].sort((a, b) => a.place - b.place);
  return (
    <View style={[styles.col, wide && styles.colWide]}>
      <View style={styles.legend}>
        <Text style={[styles.legendPts, wide && styles.legendPtsWide]}>Pts</Text>
        <Text style={[styles.legendFoul, wide && styles.legendFoulWide]}>Foul</Text>
      </View>
      {sorted.map((r) => {
        const lead = r.place === 1 && r.points > 0;
        return (
          <View key={r.playerId} style={styles.row}>
            <Text style={[styles.place, lead && styles.lead]}>{ordinal(r.place)}</Text>
            <Text
              style={[styles.name, wide && styles.nameWide, lead && styles.lead]}
              numberOfLines={1}
            >
              {r.name}
            </Text>
            <Text style={[styles.pts, wide && styles.ptsWide, lead && styles.ptsLead]}>
              {r.scored}
            </Text>
            <Text
              style={[styles.fouls, wide && styles.foulsWide, r.foulPoints > 0 && styles.foulsOn]}
            >
              {r.foulPoints}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    width: 168,
    gap: 2,
    paddingTop: 2,
  },
  colWide: {
    width: '100%',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    paddingRight: 0,
  },
  legendPts: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 9,
    width: 22,
    textAlign: 'right',
  },
  legendPtsWide: {
    width: 36,
  },
  legendFoul: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 9,
    width: 26,
    textAlign: 'right',
  },
  legendFoulWide: {
    width: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  place: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 11,
    width: 26,
  },
  name: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
    fontSize: 12,
  },
  nameWide: {
    fontSize: 14,
  },
  pts: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 12,
    width: 22,
    textAlign: 'right',
  },
  ptsWide: {
    width: 36,
    fontSize: 14,
  },
  ptsLead: {
    color: colors.mint,
  },
  fouls: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 12,
    width: 26,
    textAlign: 'right',
  },
  foulsWide: {
    width: 32,
    fontSize: 14,
  },
  foulsOn: {
    color: colors.coral,
  },
  lead: {
    color: colors.goldSoft,
  },
});
