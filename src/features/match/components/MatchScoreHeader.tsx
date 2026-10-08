import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLayout } from '@/shared/hooks/use-layout';
import { sideColor, sideSoftColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface ScorePlayerView {
  id: string;
  name: string;
  /** Points this player potted in the current frame. */
  framePoints: number;
  /** Highest break this match. */
  highestBreak: number;
}

export interface ScoreSideView {
  side: 'a' | 'b';
  players: ScorePlayerView[];
  framePoints: number;
  frames: number;
}

interface MatchScoreHeaderProps {
  a: ScoreSideView;
  b: ScoreSideView;
  /** Side at the table; null when the match is finished. */
  atTable: 'a' | 'b' | null;
  atTablePlayerId: string | null;
  currentBreak: number;
  frameNumber: number;
  /** Most frames the match can last (best of N). */
  bestOf: number;
  canSelectPlayer: boolean;
  onSelectPlayer: (playerId: string) => void;
}

/**
 * Live scoreboard: one card per side with the frame score above the player names, so who has
 * how many points is obvious at a glance. The side at the table glows in its team colour.
 */
export function MatchScoreHeader({
  a,
  b,
  atTable,
  atTablePlayerId,
  currentBreak,
  frameNumber,
  bestOf,
  canSelectPlayer,
  onSelectPlayer,
}: MatchScoreHeaderProps): ReactNode {
  const styles = useStyles(makeStyles);
  const { scale, compact } = useLayout();
  return (
    <View style={styles.row}>
      <SideCard
        view={a}
        atTable={atTable === 'a'}
        atTablePlayerId={atTablePlayerId}
        currentBreak={currentBreak}
        canSelectPlayer={canSelectPlayer}
        onSelectPlayer={onSelectPlayer}
      />
      <View style={[styles.centre, compact && styles.centreCompact]}>
        <Text style={styles.centreLabel}>Frames</Text>
        <Text style={[styles.frames, { fontSize: scale(26) }]} numberOfLines={1}>
          {a.frames}-{b.frames}
        </Text>
        <Text style={styles.centreMeta} numberOfLines={2}>
          {atTable ? `Frame ${frameNumber} of ${bestOf}` : 'Final'}
        </Text>
      </View>
      <SideCard
        view={b}
        atTable={atTable === 'b'}
        atTablePlayerId={atTablePlayerId}
        currentBreak={currentBreak}
        canSelectPlayer={canSelectPlayer}
        onSelectPlayer={onSelectPlayer}
      />
    </View>
  );
}

function SideCard({
  view,
  atTable,
  atTablePlayerId,
  currentBreak,
  canSelectPlayer,
  onSelectPlayer,
}: {
  view: ScoreSideView;
  atTable: boolean;
  atTablePlayerId: string | null;
  currentBreak: number;
  canSelectPlayer: boolean;
  onSelectPlayer: (playerId: string) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { scale } = useLayout();
  const tone = sideColor(palette, view.side);
  const doubles = view.players.length > 1;

  return (
    <View
      style={[
        styles.card,
        { borderColor: atTable ? tone : palette.border },
        atTable && { backgroundColor: sideSoftColor(palette, view.side) },
      ]}
    >
      <View style={[styles.sideBar, { backgroundColor: tone }]} />
      <Text
        style={[
          styles.points,
          { fontSize: scale(38), lineHeight: scale(44) },
          atTable && { color: tone },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={`${view.framePoints} points`}
      >
        {view.framePoints}
      </Text>
      <View style={styles.names}>
        {view.players.map((p) => {
          const on = atTable && (p.id === atTablePlayerId || !doubles);
          return (
            <Pressable
              key={p.id}
              disabled={!canSelectPlayer}
              onPress={() => onSelectPlayer(p.id)}
              accessibilityRole={canSelectPlayer ? 'button' : 'text'}
              accessibilityLabel={`${p.name}${on ? ', at the table' : ''}`}
              accessibilityHint={canSelectPlayer ? 'Set as the player at the table' : undefined}
              hitSlop={4}
              style={[
                styles.nameRow,
                canSelectPlayer && styles.nameRowTappable,
                on && doubles && { borderColor: tone },
              ]}
            >
              {on ? <View style={[styles.dot, { backgroundColor: tone }]} /> : null}
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {p.name}
              </Text>
              {doubles ? <Text style={styles.playerPts}>{p.framePoints}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {atTable && currentBreak > 0 ? (
        <View style={styles.metaRow}>
          <Text style={[styles.breakPill, { color: tone, borderColor: tone }]}>
            Break {currentBreak}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    centre: {
      width: 64,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    centreCompact: {
      width: 52,
    },
    centreLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    frames: {
      fontFamily: fonts.display,
      color: c.text,
    },
    centreMeta: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: c.textMuted,
      textAlign: 'center',
    },
    card: {
      flex: 1,
      minWidth: 0,
      borderRadius: radii.md,
      borderWidth: 1.5,
      backgroundColor: c.card,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: 4,
      overflow: 'hidden',
    },
    sideBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
    },
    points: {
      fontFamily: fonts.display,
      color: c.text,
      textAlign: 'center',
    },
    names: {
      gap: 4,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 28,
      paddingHorizontal: 6,
      borderRadius: radii.xs,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    nameRowTappable: {
      minHeight: 32,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    name: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      color: c.text,
    },
    nameOn: {
      fontFamily: fonts.bodyBold,
    },
    playerPts: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.textMuted,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    breakPill: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      overflow: 'hidden',
    },
    meta: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: c.textMuted,
    },
  });
