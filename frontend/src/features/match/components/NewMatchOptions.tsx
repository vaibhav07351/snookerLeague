import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/TextField';
import { ToggleRow } from '@/shared/ui/ToggleRow';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

interface NewMatchOptionsProps {
  open: boolean;
  onToggleOpen: () => void;
  freeForAll: boolean;
  canCrown: boolean;
  crowns: boolean;
  setCrowns: (on: boolean) => void;
  midway: boolean;
  setMidway: (on: boolean) => void;
  label: string;
  setLabel: (label: string) => void;
}

/** "More options" on a new match: title match, already mid-match, and a match name. */
export function NewMatchOptions(p: NewMatchOptionsProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const summary = [
    p.crowns ? 'Title match' : null,
    p.midway ? 'Mid-match' : null,
    p.label.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const placeholder = p.freeForAll
    ? 'Match name'
    : p.canCrown
      ? 'Title match, mid-match, name'
      : 'Mid-match, name';
  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: p.open }}
        onPress={p.onToggleOpen}
        style={styles.head}
      >
        <Ionicons name="options-outline" size={18} color={palette.textMuted} />
        <View style={styles.headText}>
          <Text style={styles.title}>More options</Text>
          <Text style={styles.summary} numberOfLines={1}>
            {summary || placeholder}
          </Text>
        </View>
        <Ionicons
          name={p.open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={palette.textMuted}
        />
      </Pressable>
      {p.open ? (
        <View style={styles.body}>
          {p.canCrown ? (
            <>
              <ToggleRow
                title="Title match"
                hint="The winner becomes the league champion."
                value={p.crowns}
                onChange={p.setCrowns}
              />
              <View style={styles.divider} />
            </>
          ) : null}
          {p.freeForAll ? null : (
            <ToggleRow
              title="We are already mid-match"
              hint="Enter frames won and the current score next."
              value={p.midway}
              onChange={p.setMidway}
            />
          )}
          <TextField
            label="Match name (optional)"
            value={p.label}
            onChangeText={p.setLabel}
            placeholder="e.g. Friday final"
            maxLength={40}
          />
        </View>
      ) : null}
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      paddingVertical: 0,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
    },
    headText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.bodyLarge,
      color: c.text,
    },
    summary: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      color: c.textMuted,
    },
    body: {
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
    },
  });
