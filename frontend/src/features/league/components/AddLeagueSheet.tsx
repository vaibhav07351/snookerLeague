import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import * as leagueService from '@/features/league/services/league.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { SessionUser } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Chip } from '@/shared/ui/Chip';
import { notify } from '@/shared/ui/notify';
import { TextField } from '@/shared/ui/TextField';
import { spacing } from '@/theme/tokens';

interface AddLeagueSheetProps {
  visible: boolean;
  onClose: () => void;
  user: SessionUser;
  /** A league was created: reload and show it. */
  onCreated: (leagueId: string) => Promise<void>;
}

/** Create another league, or join one with an invite code. */
export function AddLeagueSheet({
  visible,
  onClose,
  user,
  onCreated,
}: AddLeagueSheetProps): ReactNode {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function create(): Promise<void> {
    setBusy(true);
    try {
      const created = await leagueService.createLeague({
        name: name.trim() || `${user.displayName}'s League`,
        uid: user.uid,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
      });
      setName('');
      await onCreated(created.id);
      onClose();
      notify.success('League created', 'Share the invite so friends can join.');
    } catch (error) {
      notify.error('Could not create league', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function join(): void {
    try {
      const normalized = leagueService.normalizeInviteCode(code);
      setJoinError(undefined);
      setCode('');
      onClose();
      router.push({ pathname: '/join/[code]', params: { code: normalized } });
    } catch (error) {
      setJoinError(toUserMessage(error));
    }
  }

  return (
    <BottomSheet visible={visible} title="Add a league" onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.chips}>
          <Chip
            label="Create a league"
            selected={mode === 'create'}
            onPress={() => setMode('create')}
          />
          <Chip
            label="Join with a code"
            selected={mode === 'join'}
            onPress={() => setMode('join')}
          />
        </View>
        {mode === 'create' ? (
          <>
            <TextField
              label="New league name"
              value={name}
              onChangeText={setName}
              placeholder={`${user.displayName}'s League`}
              maxLength={40}
            />
            <Button label="Create league" loading={busy} onPress={() => void create()} />
          </>
        ) : (
          <>
            <TextField
              label="Invite code"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. K7Q2MX"
              maxLength={8}
              error={joinError}
              onSubmitEditing={join}
            />
            <Button label="Continue" icon="arrow-forward" onPress={join} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
