import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DeleteLeaguePanel } from '@/features/league/components/DeleteLeaguePanel';
import * as leagueService from '@/features/league/services/league.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { League } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { notify } from '@/shared/ui/notify';
import { TextField } from '@/shared/ui/TextField';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

interface LeagueSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  league: League;
  isOwner: boolean;
  busy: boolean;
  /** Reload the session's leagues after a save. */
  onSaved: () => Promise<void>;
  onDelete: (typedName: string) => Promise<void>;
}

/** A league's name and game defaults, and (owner only) deleting it. */
export function LeagueSettingsSheet({
  visible,
  onClose,
  league,
  isOwner,
  busy,
  onSaved,
  onDelete,
}: LeagueSettingsSheetProps): ReactNode {
  const styles = useStyles(makeStyles);
  const [name, setName] = useState(league.name);
  const [raceTarget, setRaceTarget] = useState(String(league.defaultRaceTarget));
  const [bestOf, setBestOf] = useState(String(league.defaultBestOf));
  const [saving, setSaving] = useState(false);

  // Start from the saved values each time the sheet opens or another league is shown.
  useEffect(() => {
    if (visible) {
      setName(league.name);
      setRaceTarget(String(league.defaultRaceTarget ?? 50));
      setBestOf(String(league.defaultBestOf ?? 3));
    }
  }, [visible, league.id, league.name, league.defaultRaceTarget, league.defaultBestOf]);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await leagueService.updateLeagueDefaults(league.id, {
        name,
        defaultRaceTarget: Number(raceTarget) || 50,
        defaultBestOf: Number(bestOf) || 3,
      });
      await onSaved();
      notify.success('League settings saved');
      onClose();
    } catch (error) {
      notify.error('Could not save', toUserMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} title={`${league.name} settings`} onClose={onClose}>
      <View style={styles.body}>
        <TextField label="League name" value={name} onChangeText={setName} maxLength={40} />
        <TextField
          label="Default race target"
          value={raceTarget}
          onChangeText={setRaceTarget}
          keyboardType="number-pad"
          hint="Score after fouls needed to finish a race"
        />
        <TextField
          label="Default best of"
          value={bestOf}
          onChangeText={setBestOf}
          keyboardType="number-pad"
          hint="Frames in a match: 1, 3, 5, 7... An even number is saved as the next odd one."
        />
        <Button label="Save settings" loading={saving} onPress={() => void save()} />
        {isOwner ? (
          <DeleteLeaguePanel league={league} busy={busy} onDelete={onDelete} />
        ) : (
          <Text style={styles.note}>Only the league owner can delete this league.</Text>
        )}
      </View>
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: {
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
    note: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      color: c.textMuted,
    },
  });
