import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface GridTileData {
  key: string;
  label: string;
  value: string;
  hint?: string;
  /** Colour of the tile's top edge; defaults to primary. */
  accent?: string;
  onPress?: () => void;
}

interface GridTileProps {
  tile: GridTileData;
  /** Hide the hint line (short screens). */
  dense: boolean;
}

/** One stat tile that stretches to fill its grid cell. Tappable tiles show a chevron. */
export function GridTile({ tile, dense }: GridTileProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const body = (
    <>
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>
          {tile.label}
        </Text>
        {tile.onPress ? (
          <Ionicons name="chevron-forward" size={12} color={palette.textMuted} />
        ) : null}
      </View>
      <Text
        style={[styles.value, dense && styles.valueDense]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {tile.value}
      </Text>
      {tile.hint && !dense ? (
        <Text style={styles.hint} numberOfLines={1}>
          {tile.hint}
        </Text>
      ) : null}
    </>
  );
  const frame = [styles.tile, { borderTopColor: tile.accent ?? palette.primary }];
  if (tile.onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tile.label} ${tile.value}${tile.hint ? `, ${tile.hint}` : ''}`}
        onPress={tile.onPress}
        style={({ pressed }) => [...frame, pressed && styles.pressed]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View style={frame} accessible accessibilityLabel={`${tile.label} ${tile.value}`}>
      {body}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderTopWidth: 3,
      gap: 2,
    },
    pressed: {
      opacity: 0.8,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    label: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    value: {
      fontFamily: fonts.bodyBold,
      fontSize: 24,
      color: c.text,
    },
    valueDense: {
      fontSize: 20,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: c.textMuted,
    },
  });
