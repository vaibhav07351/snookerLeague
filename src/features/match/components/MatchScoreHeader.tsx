import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FrameLiveRanks, type FrameRankView } from '@/features/match/components/FrameLiveRanks';
import type { OpenFrame } from '@/shared/types/domain';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export interface NamedPlayer {
  id: string;
  name: string;
}

interface MatchScoreHeaderProps {
  framesA: number;
  framesB: number;
  openFrame: OpenFrame | null;
  teamALabel: string;
  teamBLabel: string;
  teamAPlayers: NamedPlayer[];
  teamBPlayers: NamedPlayer[];
  isDoubles: boolean;
  inProgress: boolean;
  meta: string;
  namedLabel: string | null;
  canSelectPlayer: boolean;
  onSelectPlayer: (playerId: string) => void;
  frameRanks: FrameRankView[];
  framePointsA: number;
  framePointsB: number;
  framePointsHint: string;
}

function playerName(players: NamedPlayer[], id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }
  return players.find((p) => p.id === id)?.name ?? null;
}

export function MatchScoreHeader({
  framesA,
  framesB,
  openFrame,
  teamALabel,
  teamBLabel,
  teamAPlayers,
  teamBPlayers,
  isDoubles,
  inProgress,
  meta,
  namedLabel,
  canSelectPlayer,
  onSelectPlayer,
  frameRanks,
  framePointsA,
  framePointsB,
  framePointsHint,
}: MatchScoreHeaderProps): ReactNode {
  const allPlayers = [...teamAPlayers, ...teamBPlayers];
  const impliedScorerId =
    openFrame?.atTablePlayerId ??
    (openFrame?.atTable === 'a' ? teamAPlayers[0]?.id : teamBPlayers[0]?.id) ??
    null;
  const scorerName = playerName(allPlayers, impliedScorerId);

  return (
    <View style={styles.wrap}>
      {namedLabel ? <Text style={styles.named}>{namedLabel}</Text> : null}
      <View style={styles.top}>
        <View style={styles.scoreCol}>
          <Text style={styles.frames}>
            {framesA} – {framesB}
          </Text>
          <Text style={styles.framesHint}>Frames</Text>
          {inProgress ? (
            <>
              <Text style={styles.livePts}>
                {framePointsA} – {framePointsB}
              </Text>
              <Text style={styles.liveHint}>{framePointsHint}</Text>
            </>
          ) : null}
        </View>
        {inProgress ? <FrameLiveRanks ranks={frameRanks} /> : null}
      </View>
      <View style={styles.vsRow}>
        <Text style={styles.team} numberOfLines={2}>
          {teamALabel}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.team, styles.teamRight]} numberOfLines={2}>
          {teamBLabel}
        </Text>
      </View>
      <Text style={styles.meta}>{meta}</Text>
      {inProgress && openFrame ? (
        <Text style={styles.atTable} numberOfLines={1}>
          {scorerName ? `${scorerName} to play` : 'Select who is at the table'}
          {openFrame.currentBreak > 0 ? ` · Break ${openFrame.currentBreak}` : ''}
        </Text>
      ) : null}
      {inProgress && isDoubles ? (
        <View style={styles.sides}>
          <View style={styles.sideCol}>
            {teamAPlayers.map((p) => {
              const on = impliedScorerId === p.id;
              return (
                <Pressable
                  key={p.id}
                  disabled={!canSelectPlayer}
                  onPress={() => onSelectPlayer(p.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.sideCol}>
            {teamBPlayers.map((p) => {
              const on = impliedScorerId === p.id;
              return (
                <Pressable
                  key={p.id}
                  disabled={!canSelectPlayer}
                  onPress={() => onSelectPlayer(p.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    marginBottom: spacing.sm,
  },
  named: {
    fontFamily: fonts.bodyBold,
    color: colors.gold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  scoreCol: {
    flex: 1,
  },
  frames: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.goldSoft,
    lineHeight: 40,
  },
  framesHint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 11,
  },
  livePts: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.mint,
    lineHeight: 40,
  },
  liveHint: {
    fontFamily: fonts.body,
    color: colors.mint,
    fontSize: 11,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  team: {
    flex: 1,
    color: colors.chalk,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  teamRight: {
    textAlign: 'right',
  },
  vs: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 12,
  },
  meta: {
    color: colors.chalkMuted,
    fontSize: 12,
  },
  atTable: {
    fontFamily: fonts.bodyMedium,
    color: colors.goldSoft,
    fontSize: 13,
  },
  sides: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  sideCol: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    flexGrow: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: colors.surfaceBright,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
    fontSize: 12,
  },
  chipTextOn: {
    color: colors.goldSoft,
    fontFamily: fonts.bodyBold,
  },
});
