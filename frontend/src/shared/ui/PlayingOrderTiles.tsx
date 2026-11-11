import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/shared/feedback/haptics';
import { useLayout } from '@/shared/hooks/use-layout';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface PlayingOrderTile {
  id: string;
  name: string;
  /** Points this frame (or the running score in a race). */
  points: number;
  /** Can't be put at the table, e.g. finished or out. */
  disabled?: boolean;
}

interface PlayingOrderTilesProps {
  /** Players in playing order; the order never changes while scoring. */
  tiles: PlayingOrderTile[];
  atTableId: string | null;
  currentBreak: number;
  /** Omit for a read-only view. */
  onSelect?: (id: string) => void;
}

const MAX_PER_ROW = 4;

/** Up to 4 in one row; 5 to 8 split over two even rows; more fill rows of 4. */
function perRow(count: number): number {
  if (count <= MAX_PER_ROW) {
    return Math.max(1, count);
  }
  return Math.min(MAX_PER_ROW, Math.ceil(count / 2));
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/**
 * Who plays, in table order, styled like the two-sided match's side cards: points on top, name
 * below. The player at the table glows; tap a tile to put that player at the table.
 */
export function PlayingOrderTiles({
  tiles,
  atTableId,
  currentBreak,
  onSelect,
}: PlayingOrderTilesProps): ReactNode {
  const styles = useStyles(makeStyles);
  const size = perRow(tiles.length);
  const rows = chunk(tiles, size);

  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((t) => (
            <Tile
              key={t.id}
              tile={t}
              atTable={t.id === atTableId}
              currentBreak={currentBreak}
              compact={size > 2}
              onSelect={onSelect}
            />
          ))}
          {/* Keeps a short last row's tiles the same width as the rows above. */}
          {Array.from({ length: size - row.length }, (_, i) => (
            <View key={`gap-${i}`} style={styles.spacer} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Tile({
  tile,
  atTable,
  currentBreak,
  compact,
  onSelect,
}: {
  tile: PlayingOrderTile;
  atTable: boolean;
  currentBreak: number;
  compact: boolean;
  onSelect?: (id: string) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { scale } = useLayout();
  const canPick = onSelect != null && !tile.disabled;
  const pointsSize = compact ? scale(22) : scale(30);

  return (
    <View style={styles.cardWrap}>
      <Pressable
        disabled={!canPick}
        onPress={() => {
          haptic('tap');
          onSelect?.(tile.id);
        }}
        accessibilityRole={canPick ? 'button' : 'text'}
        accessibilityState={canPick ? { selected: atTable } : undefined}
        accessibilityLabel={`${tile.name}, ${tile.points} points${atTable ? ', at the table' : ''}`}
        accessibilityHint={canPick && !atTable ? 'Set as the player at the table' : undefined}
        style={({ pressed }) => [
          styles.card,
          atTable && styles.cardOn,
          tile.disabled && styles.cardOff,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.bar, atTable && { backgroundColor: palette.primary }]} />
        <Text
          style={[
            styles.points,
            { fontSize: pointsSize, lineHeight: Math.round(pointsSize * 1.15) },
            atTable && { color: palette.primary },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {tile.points}
        </Text>
        <View style={styles.nameRow}>
          {atTable ? <View style={styles.dot} /> : null}
          <Text style={[styles.name, atTable && styles.nameOn]} numberOfLines={1}>
            {tile.name}
          </Text>
        </View>
      </Pressable>
      {/* Sits on the card's bottom edge, out of the flow, so the layout below never moves. */}
      {atTable && currentBreak > 0 ? (
        <View style={styles.breakBadge} pointerEvents="none">
          <Text style={styles.breakPill} numberOfLines={1}>
            Break {currentBreak}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    grid: {
      gap: spacing.sm + 4,
      paddingBottom: 4,
    },
    row: {
      flexDirection: 'row',
      gap: 6,
    },
    cardWrap: {
      flex: 1,
      minWidth: 0,
    },
    spacer: {
      flex: 1,
    },
    card: {
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 8,
      alignItems: 'center',
      gap: 2,
      overflow: 'hidden',
    },
    cardOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    cardOff: {
      opacity: 0.45,
    },
    pressed: {
      opacity: 0.75,
    },
    bar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: c.border,
    },
    points: {
      fontFamily: fonts.display,
      color: c.text,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      maxWidth: '100%',
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.primary,
    },
    name: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.text,
    },
    nameOn: {
      fontFamily: fonts.bodyBold,
    },
    breakBadge: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -9,
      alignItems: 'center',
    },
    // Opaque page background so the pill cuts cleanly through the card border it sits on.
    breakPill: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      lineHeight: 16,
      paddingHorizontal: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.primary,
      color: c.primary,
      backgroundColor: c.bg,
      overflow: 'hidden',
    },
  });
