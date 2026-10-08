import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface PagedListProps<T> {
  items: T[];
  /** Fixed row height: the list shows as many rows as fit, never scrolls. */
  rowHeight: number;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Changing this jumps back to the first page (e.g. a new board or filter). */
  resetKey?: string;
  /**
   * Key of a row to keep in view (e.g. your own). When the list needs more than one page,
   * that row is taken out of the pages and pinned under them, so it shows exactly once.
   */
  pinnedKey?: string | null;
  /** Word for the summary when everything fits on one page, e.g. "players". */
  noun?: string;
  empty?: ReactNode;
}

const GAP = spacing.xs + 2;

/** A list that pages instead of scrolling, sized to the space it is given. */
export function PagedList<T>({
  items,
  rowHeight,
  keyExtractor,
  renderItem,
  resetKey,
  pinnedKey,
  noun = 'rows',
  empty,
}: PagedListProps<T>): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const [areaHeight, setAreaHeight] = useState(0);
  // The page is tagged with the reset key it belongs to, so a new key starts at page 1.
  const [paging, setPaging] = useState({ key: resetKey, page: 0 });
  const page = paging.key === resetKey ? paging.page : 0;
  const setPage = (next: number): void => setPaging({ key: resetKey, page: next });

  const fit = (height: number): number =>
    Math.max(1, Math.floor((height + GAP) / (rowHeight + GAP)));
  const pinned = pinnedKey ? items.find((item) => keyExtractor(item) === pinnedKey) : undefined;
  // Pin only when paging is needed; if everything fits, the row is already in view.
  const pinning = pinned != null && items.length > fit(areaHeight);
  const pool = pinning ? items.filter((item) => item !== pinned) : items;
  const pageSize = pinning ? fit(areaHeight - rowHeight - GAP) : fit(areaHeight);
  const pages = Math.max(1, Math.ceil(pool.length / pageSize));
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;
  const visible = areaHeight > 0 ? pool.slice(start, start + pageSize) : [];

  if (items.length === 0 && empty) {
    return <View style={styles.flex}>{empty}</View>;
  }

  return (
    <View style={styles.flex}>
      {/* The measured area never changes size with its content, so paging stays stable. */}
      <View style={styles.area} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        <View style={styles.rows}>
          {visible.map((item) => (
            <View key={keyExtractor(item)} style={{ height: rowHeight }}>
              {renderItem(item)}
            </View>
          ))}
        </View>
        {pinning && pinned != null && areaHeight > 0 ? (
          <View style={{ height: rowHeight }}>{renderItem(pinned)}</View>
        ) : null}
      </View>
      <View style={styles.pager}>
        {pages > 1 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              disabled={current === 0}
              hitSlop={6}
              onPress={() => setPage(current - 1)}
              style={({ pressed }) => [
                styles.arrow,
                current === 0 && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </Pressable>
            <Text style={styles.summary}>
              {start + 1}-{Math.min(start + pageSize, pool.length)} of {pool.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next page"
              disabled={current >= pages - 1}
              hitSlop={6}
              onPress={() => setPage(current + 1)}
              style={({ pressed }) => [
                styles.arrow,
                current >= pages - 1 && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="chevron-forward" size={20} color={palette.text} />
            </Pressable>
          </>
        ) : (
          <Text style={styles.summary}>
            {items.length} {noun}
          </Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      minHeight: 0,
    },
    area: {
      flex: 1,
      minHeight: 0,
      justifyContent: 'space-between',
      ...(Platform.OS === 'web' ? { overflow: 'hidden' as const } : {}),
    },
    rows: {
      gap: GAP,
    },
    pager: {
      height: TOUCH_TARGET - 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    arrow: {
      width: TOUCH_TARGET - 4,
      height: TOUCH_TARGET - 4,
      borderRadius: (TOUCH_TARGET - 4) / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    disabled: {
      opacity: 0.35,
    },
    pressed: {
      opacity: 0.75,
    },
    summary: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textMuted,
      minWidth: 90,
      textAlign: 'center',
    },
  });
