import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { TourTarget } from '@/features/tour/components/TourTarget';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

import type { NewMatchKind } from '@/features/match/hooks/use-new-match';

const KIND_OPTIONS: { kind: NewMatchKind; title: string; sub: string }[] = [
  { kind: 'singles', title: 'Singles', sub: '1 v 1' },
  { kind: 'doubles', title: 'Doubles', sub: '2 v 2' },
  { kind: 'one_vs_two', title: '1 vs 2', sub: 'Solo v pair' },
  { kind: 'free_for_all', title: 'Free-for-all', sub: '3 to 8' },
];

interface MatchKindTabsProps {
  value: NewMatchKind;
  onChange: (kind: NewMatchKind) => void;
}

/** The format switch at the top of "New match": singles, doubles, 1 vs 2, free-for-all. */
export function MatchKindTabs({ value, onChange }: MatchKindTabsProps): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <TourTarget id="match-new.format" style={styles.segment}>
      {KIND_OPTIONS.map(({ kind, title, sub }) => (
        <Pressable
          key={kind}
          accessibilityRole="radio"
          accessibilityLabel={`${title}, ${sub}`}
          accessibilityState={{ selected: value === kind }}
          onPress={() => onChange(kind)}
          style={[styles.segmentItem, value === kind && styles.segmentOn]}
        >
          <Text
            style={[styles.segmentText, value === kind && styles.segmentTextOn]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </Pressable>
      ))}
    </TourTarget>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    segment: {
      flexDirection: 'row',
      padding: 4,
      gap: 4,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: spacing.sm,
    },
    // Sized to the label, spare width shared: "Free-for-all" is far longer than "1 vs 2", and
    // equal quarters cut it off on 320-wide phones. Titles only, so all four fit one row.
    segmentItem: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minHeight: 44,
      paddingHorizontal: 6,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentOn: {
      backgroundColor: c.primary,
    },
    segmentText: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.small,
      color: c.textMuted,
    },
    segmentTextOn: {
      color: c.onPrimary,
    },
  });
