import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import * as playersService from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { raceRules } from '@/features/rules/services/rules';
import { toUserMessage } from '@/shared/errors/app-error';
import type { Player } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

const TARGET_PRESETS = [50, 75, 100] as const;

export default function NewRaceScreen(): ReactNode {
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('50');
  const [customTarget, setCustomTarget] = useState(false);
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();

  useEffect(() => {
    if (!league) {
      return;
    }
    setTarget(String(league.defaultRaceTarget));
    setCustomTarget(!(TARGET_PRESETS as readonly number[]).includes(league.defaultRaceTarget));
    void playersService.listPlayers(league.id).then(setPlayers);
  }, [league]);

  function toggle(id: string): void {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create(): Promise<void> {
    if (!league || !user) {
      return;
    }
    setBusy(true);
    try {
      const race = await raceService.createRace({
        leagueId: league.id,
        createdByUid: user.uid,
        playerIds: selected,
        targetScore: Number(target) || league.defaultRaceTarget,
        namedLabel: label.trim() || null,
        crownsRaceChampion: crowns,
      });
      router.replace(`/race/${race.id}`);
    } catch (error) {
      notify.error('Could not start race', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!league) {
    return null;
  }

  const extrasSummary = [crowns ? 'Crowns race king' : null, label.trim() || null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      footer={
        <Button
          label={
            selected.length >= 2 ? `Start race (${selected.length})` : 'Pick 2 or more players'
          }
          icon="flag"
          loading={busy}
          onPress={() => void create()}
          disabled={busy || selected.length < 2}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={[typography.subtitle, styles.introText]}>
          Everyone plays alone. Fouls come off your own score. First to the target wins.
        </Text>
        <RulesButton rules={raceRules(Number(target) || league?.defaultRaceTarget || 50)} />
      </View>

      <Text style={[styles.label, styles.gap]}>Players</Text>
      {players.length < 2 ? (
        <EmptyState
          icon="people-outline"
          title="Add at least two players"
          message="Races need 2+ people on the roster."
          actionLabel="Go to players"
          onAction={() => router.push('/(main)/players')}
        />
      ) : (
        <View style={styles.grid}>
          {players.map((p) => (
            <Chip
              key={p.id}
              label={p.displayName}
              selected={selected.includes(p.id)}
              onPress={() => toggle(p.id)}
            />
          ))}
        </View>
      )}

      <Text style={[styles.label, styles.gap]}>Race to</Text>
      <View style={styles.targetRow}>
        {TARGET_PRESETS.map((n) => {
          const on = !customTarget && Number(target) === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`Race to ${n}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setCustomTarget(false);
                setTarget(String(n));
              }}
              style={[styles.target, on && styles.targetOn]}
            >
              <Text style={[styles.targetText, on && styles.targetTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel="Other target"
          accessibilityState={{ selected: customTarget }}
          onPress={() => setCustomTarget(true)}
          style={[styles.target, customTarget && styles.targetOn]}
        >
          <Text style={[styles.targetText, customTarget && styles.targetTextOn]}>Other</Text>
        </Pressable>
      </View>
      {customTarget ? (
        <View style={styles.customField}>
          <TextField
            label="Target score"
            value={target}
            onChangeText={setTarget}
            keyboardType="number-pad"
            autoFocus
          />
        </View>
      ) : null}

      <Card style={[styles.moreCard, styles.gap]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: moreOpen }}
          onPress={() => setMoreOpen((v) => !v)}
          style={styles.moreHead}
        >
          <Ionicons name="options-outline" size={18} color={palette.textMuted} />
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>More options</Text>
            <Text style={styles.switchHint} numberOfLines={1}>
              {extrasSummary || 'Race king, name'}
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
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>Crowns race king</Text>
                <Text style={styles.switchHint}>1st place becomes the race king</Text>
              </View>
              <Switch
                accessibilityLabel="Crowns race king"
                value={crowns}
                onValueChange={setCrowns}
                trackColor={{ false: palette.cardRaised, true: palette.primary }}
              />
            </View>
            <TextField
              label="Race name (optional)"
              value={label}
              onChangeText={setLabel}
              placeholder="Friday race"
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    intro: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    introText: {
      flex: 1,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    gap: {
      marginTop: spacing.lg,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    targetRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    target: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    targetOn: {
      borderColor: c.primary,
      backgroundColor: c.primary,
    },
    targetText: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.lead,
      color: c.text,
    },
    targetTextOn: {
      color: c.onPrimary,
    },
    customField: {
      marginTop: spacing.md,
    },
    moreCard: {
      paddingVertical: 0,
    },
    moreHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 56,
    },
    moreBody: {
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
    },
    switchCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    switchLabel: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.bodyLarge,
    },
    switchHint: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      color: c.textMuted,
    },
  });
