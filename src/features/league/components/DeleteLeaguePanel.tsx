import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { TextField } from '@/features/home/components/TextField';
import type { League } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

interface DeleteLeaguePanelProps {
  league: League;
  busy: boolean;
  /** Called with the typed name once every confirmation passed. */
  onDelete: (typedName: string) => Promise<void>;
}

/** Owner-only "danger zone": two confirms, then type the exact name. */
export function DeleteLeaguePanel({ league, busy, onDelete }: DeleteLeaguePanelProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === league.name;

  async function start(): Promise<void> {
    const ok = await confirmAction(
      'Delete this league?',
      `"${league.name}" and all of its matches, races, players and stats are removed for everyone. This cannot be undone.`,
      'Continue',
    );
    if (ok) {
      setTyped('');
      setTyping(true);
    }
  }

  return (
    <View style={styles.zone}>
      <Text style={typography.label}>Danger zone</Text>
      <Text style={styles.hint}>
        Deleting removes every match, race, player and stat in this league for all members.
      </Text>
      {!typing ? (
        <Button
          label="Delete this league"
          variant="danger"
          onPress={() => void start()}
          disabled={busy}
        />
      ) : (
        <View style={styles.panel}>
          <Text style={styles.title}>Type the league name to confirm</Text>
          <Text style={styles.hint}>
            Enter exactly: <Text style={styles.exact}>{league.name}</Text>
          </Text>
          <TextField
            label="League name"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={league.name}
          />
          <View style={styles.row}>
            <Button
              label="Cancel"
              variant="ghost"
              style={styles.flex}
              disabled={busy}
              onPress={() => {
                setTyping(false);
                setTyped('');
              }}
            />
            <Button
              label="Delete forever"
              variant="danger"
              style={styles.flex}
              loading={busy}
              disabled={busy || !matches}
              onPress={() => void onDelete(typed)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    zone: {
      marginTop: spacing.xl,
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.danger,
      backgroundColor: c.dangerSoft,
    },
    panel: {
      gap: spacing.sm,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    exact: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    flex: {
      flex: 1,
    },
  });
