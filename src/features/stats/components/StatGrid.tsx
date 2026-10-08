import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GridTile, type GridTileData } from '@/features/stats/components/GridTile';
import { spacing } from '@/theme/tokens';

interface StatGridProps {
  tiles: GridTileData[];
  columns?: 2 | 3;
  dense?: boolean;
  /** Tallest a row may grow on big screens, so tiles do not turn into empty slabs. */
  maxRowHeight?: number;
}

/** Tiles laid out in rows that share the available height evenly. */
export function StatGrid({
  tiles,
  columns = 2,
  dense = false,
  maxRowHeight = 112,
}: StatGridProps): ReactNode {
  const rows: GridTileData[][] = [];
  for (let i = 0; i < tiles.length; i += columns) {
    rows.push(tiles.slice(i, i + columns));
  }
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View
          key={row.map((t) => t.key).join('|')}
          style={[styles.row, { maxHeight: maxRowHeight, minHeight: dense ? 58 : 70 }]}
        >
          {row.map((tile) => (
            <GridTile key={tile.key} tile={tile} dense={dense} />
          ))}
          {/* Keep tiles in a short last row the same width as the rows above. */}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`pad-${i}`} style={styles.pad} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    gap: spacing.sm,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pad: {
    flex: 1,
  },
});
