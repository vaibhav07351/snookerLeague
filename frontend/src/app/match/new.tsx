import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as groupService from '@/features/group/services/group.service';
import { useNewMatchForm, type NewMatchKind } from '@/features/match/hooks/use-new-match';
import * as matchService from '@/features/match/services/match.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { freeForAllRules, matchRules } from '@/features/rules/services/rules';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useAutoTour } from '@/features/tour/hooks/use-tour';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11] as const;

const KIND_OPTIONS: { kind: NewMatchKind; title: string; sub: string }[] = [
  { kind: 'singles', title: 'Singles', sub: '1 v 1' },
  { kind: 'doubles', title: 'Doubles', sub: '2 v 2' },
  { kind: 'one_vs_two', title: '1 vs 2', sub: 'Solo v pair' },
  { kind: 'free_for_all', title: 'Free-for-all', sub: '3 to 8' },
];

const KIND_NAMES: Record<NewMatchKind, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  one_vs_two: '1 vs 2',
  free_for_all: 'Free-for-all',
};

export default function NewMatchScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { league } = useSession();
  const params = useLocalSearchParams<{ opponentPlayerId?: string; leagueId?: string }>();
  const f = useNewMatchForm({
    opponentPlayerId:
      typeof params.opponentPlayerId === 'string' ? params.opponentPlayerId : undefined,
    leagueId: typeof params.leagueId === 'string' ? params.leagueId : undefined,
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);
  useAutoTour('match-new', f.loaded && league != null);

  if (!league) {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="Join or create a league first"
          message="Matches belong to a league, so friends can follow them live."
          actionLabel="Set up a league"
          onAction={() => router.replace('/onboarding')}
        />
      </Screen>
    );
  }

  // Says what is still missing: with you already in Side A, singles needs just one more.
  const picked = f.freeForAll ? f.group.length : f.sideA.length + f.sideB.length;
  const missing = Math.max(1, f.needed - picked);
  const startLabel = f.ready
    ? 'Start match'
    : `Pick ${f.freeForAll ? 'at least ' : ''}${missing} ${picked > 0 ? 'more ' : ''}${missing === 1 ? 'player' : 'players'}`;
  const extrasSummary = [
    f.crowns ? 'Title match' : null,
    f.midway ? 'Mid-match' : null,
    f.label.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tooFew = f.loaded && f.players.length < f.needed;

  return (
    // One page, no scroll: only the player list scrolls (inside its own box) when the league is
    // big. Typing (a match name, a guest) lets the page scroll, since the keyboard comes up.
    <Screen
      scroll={moreOpen || addingGuest}
      footer={
        <TourTarget id="match-new.start">
          <Button
            label={startLabel}
            icon="play"
            loading={f.busy}
            onPress={() => void f.create()}
            disabled={f.busy || !f.ready}
          />
        </TourTarget>
      }
    >
      <TourTarget id="match-new.format" style={styles.segment}>
        {KIND_OPTIONS.map(({ kind, title, sub }) => (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            accessibilityLabel={`${title}, ${sub}`}
            accessibilityState={{ selected: f.format === kind }}
            onPress={() => f.changeFormat(kind)}
            style={[styles.segmentItem, f.format === kind && styles.segmentOn]}
          >
            <Text
              style={[styles.segmentText, f.format === kind && styles.segmentTextOn]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </TourTarget>

      {f.freeForAll ? (
        // The numbered player chips below already show the order, so this stays one line.
        <TourTarget id="match-new.sides" style={styles.orderSlot}>
          <Text style={[styles.slotTitle, { color: palette.primary }]}>Playing order</Text>
          <Text style={styles.orderHint} numberOfLines={2}>
            {f.group.length === 0
              ? `Tap ${groupService.MIN_GROUP_PLAYERS} to ${groupService.MAX_GROUP_PLAYERS} players in the order they play. #1 breaks.`
              : `${f.group.length} picked · ${f.nameOf(f.group[0] ?? '')} breaks. Tap again to remove.`}
          </Text>
        </TourTarget>
      ) : (
        <TourTarget id="match-new.sides" style={styles.sides}>
          <SideSlot
            side="a"
            ids={f.sideA}
            perSide={f.sizeA}
            nameOf={f.nameOf}
            onRemove={f.toggle}
          />
          <Text style={styles.vs}>vs</Text>
          <SideSlot
            side="b"
            ids={f.sideB}
            perSide={f.sizeB}
            nameOf={f.nameOf}
            onRemove={f.toggle}
          />
        </TourTarget>
      )}

      <View style={styles.labelGap} />
      {tooFew ? (
        <Text style={styles.needMore}>
          {KIND_NAMES[f.format]} needs {f.freeForAll ? 'at least ' : ''}
          {f.needed} players. Add a guest below, or invite friends from the league screen.
        </Text>
      ) : null}
      {addingGuest ? (
        <GuestForm
          onAdd={async (name) => {
            if (await f.addGuest(name)) {
              setAddingGuest(false);
            }
          }}
          onCancel={() => setAddingGuest(false)}
        />
      ) : null}
      <ScrollView
        style={moreOpen || addingGuest ? undefined : styles.playersBox}
        contentContainerStyle={styles.grid}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={!moreOpen}
      >
        {f.players.map((p) => {
          const seat = f.freeForAll ? f.group.indexOf(p.id) : -1;
          const inGroup = seat >= 0;
          const inA = !f.freeForAll && f.sideA.includes(p.id);
          const inB = !f.freeForAll && f.sideB.includes(p.id);
          const tag = inGroup ? `${seat + 1} · ` : inA ? 'A · ' : inB ? 'B · ' : '';
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: inA || inB || inGroup }}
              onPress={() => f.toggle(p.id)}
              hitSlop={2}
              style={[
                styles.player,
                inA && { borderColor: palette.teamA, backgroundColor: palette.teamASoft },
                inB && { borderColor: palette.teamB, backgroundColor: palette.teamBSoft },
                inGroup && {
                  borderColor: palette.primary,
                  backgroundColor: palette.cardHighlight,
                },
              ]}
            >
              <Text
                style={[
                  styles.playerText,
                  inA && { color: palette.teamA },
                  inB && { color: palette.teamB },
                  inGroup && { color: palette.primary },
                ]}
                numberOfLines={1}
              >
                {tag}
                {p.displayName}
              </Text>
            </Pressable>
          );
        })}
        {f.loaded && !addingGuest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a guest player"
            onPress={() => setAddingGuest(true)}
            hitSlop={2}
            style={[styles.player, styles.addGuest]}
          >
            <Ionicons name="add" size={16} color={palette.textMuted} />
            <Text style={styles.addGuestText}>Guest</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.bestOfHead, styles.labelGap]}>
        <View style={styles.bestOfLabel}>
          <Text style={styles.label}>Best of</Text>
          <Text style={styles.hint}>
            {f.freeForAll
              ? `Plays ${f.bestOf}, most frames wins`
              : `First to ${matchService.framesToWin(f.bestOf)} wins`}
          </Text>
        </View>
        <RulesButton
          rules={
            f.format === 'free_for_all' ? freeForAllRules(f.bestOf) : matchRules(f.bestOf, f.format)
          }
        />
      </View>
      <View style={styles.bestOfRow}>
        {BEST_OF_OPTIONS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`Best of ${n}`}
            accessibilityState={{ selected: f.bestOf === n }}
            onPress={() => f.setBestOf(n)}
            style={[styles.bestOf, f.bestOf === n && styles.bestOfOn]}
          >
            <Text style={[styles.bestOfText, f.bestOf === n && styles.bestOfTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <TourTarget id="match-new.extras" style={styles.labelGap}>
        <Card style={styles.moreCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            onPress={() => setMoreOpen((v) => !v)}
            style={styles.moreHead}
          >
            <Ionicons name="options-outline" size={18} color={palette.textMuted} />
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>More options</Text>
              <Text style={styles.moreSummary} numberOfLines={1}>
                {extrasSummary ||
                  (f.freeForAll
                    ? 'Match name'
                    : f.canCrown
                      ? 'Title match, mid-match, name'
                      : 'Mid-match, name')}
              </Text>
            </View>
            <Ionicons
              name={moreOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={palette.textMuted}
            />
          </Pressable>
          {moreOpen ? (
            <View style={styles.moreBody}>
              {f.canCrown ? (
                <>
                  <ToggleRow
                    title="Title match"
                    hint="The winner becomes the league champion."
                    value={f.crowns}
                    onChange={f.setCrowns}
                  />
                  <View style={styles.divider} />
                </>
              ) : null}
              {f.freeForAll ? null : (
                <ToggleRow
                  title="We are already mid-match"
                  hint="Enter frames won and the current score next."
                  value={f.midway}
                  onChange={f.setMidway}
                />
              )}
              <TextField
                label="Match name (optional)"
                value={f.label}
                onChangeText={f.setLabel}
                placeholder="e.g. Friday final"
                maxLength={40}
              />
            </View>
          ) : null}
        </Card>
      </TourTarget>
    </Screen>
  );
}

/** Inline "add a guest": a name and Add, without leaving the match being set up. */
function GuestForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string) => Promise<void>;
  onCancel: () => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length >= 2;
  const submit = async (): Promise<void> => {
    if (!valid || saving) {
      return;
    }
    setSaving(true);
    try {
      await onAdd(name.trim());
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={styles.guestCard}>
      <TextField
        label="Guest name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rahul Sharma"
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <View style={styles.guestActions}>
        <Button
          label="Cancel"
          size="sm"
          variant="ghost"
          onPress={onCancel}
          style={styles.actionFlex}
        />
        <Button
          label="Add guest"
          icon="person-add-outline"
          size="sm"
          loading={saving}
          disabled={!valid || saving}
          onPress={() => void submit()}
          style={styles.actionFlex}
        />
      </View>
    </Card>
  );
}

function SideSlot({
  side,
  ids,
  perSide,
  nameOf,
  onRemove,
}: {
  side: 'a' | 'b';
  ids: string[];
  perSide: number;
  nameOf: (id: string) => string;
  onRemove: (id: string) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const tone = sideColor(palette, side);
  return (
    <View style={[styles.slot, { borderColor: tone }]}>
      <Text style={[styles.slotTitle, { color: tone }]}>Side {side.toUpperCase()}</Text>
      {Array.from({ length: perSide }, (_, i) => {
        const id = ids[i];
        return id ? (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${nameOf(id)} from side ${side.toUpperCase()}`}
            onPress={() => onRemove(id)}
            hitSlop={4}
          >
            <Text style={styles.slotName} numberOfLines={1}>
              {nameOf(id)}
            </Text>
          </Pressable>
        ) : (
          <Text key={`empty-${i}`} style={styles.slotEmpty}>
            Tap a player
          </Text>
        );
      })}
    </View>
  );
}

function ToggleRow({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ false: palette.cardRaised, true: palette.primary }}
        thumbColor={palette.text}
      />
    </View>
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
      fontSize: 13,
      color: c.textMuted,
    },
    // Takes the height left over, so the page itself never scrolls.
    playersBox: {
      flex: 1,
      minHeight: 0,
    },
    orderSlot: {
      marginTop: spacing.md,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.primary,
      gap: 2,
    },
    orderHint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    segmentTextOn: {
      color: c.onPrimary,
    },
    sides: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    vs: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.textMuted,
    },
    slot: {
      flex: 1,
      minWidth: 0,
      minHeight: 84,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      gap: 4,
    },
    slotTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    slotName: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
      minHeight: 24,
    },
    slotEmpty: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textFaint,
      minHeight: 24,
    },
    needMore: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    player: {
      maxWidth: '100%',
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    playerText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.text,
    },
    addGuest: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
    },
    addGuestText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.textMuted,
    },
    guestCard: {
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    guestActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionFlex: {
      flex: 1,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 17,
      color: c.textMuted,
      marginTop: 4,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    toggleText: {
      flex: 1,
      minWidth: 0,
    },
    toggleTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    labelGap: {
      marginTop: spacing.md,
    },
    bestOfHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    bestOfLabel: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexShrink: 1,
      gap: spacing.sm,
    },
    bestOfRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    bestOf: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    bestOfOn: {
      borderColor: c.primary,
      backgroundColor: c.primary,
    },
    bestOfText: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    bestOfTextOn: {
      color: c.onPrimary,
    },
    moreCard: {
      paddingVertical: 0,
    },
    moreHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
    },
    moreSummary: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    moreBody: {
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
  });
