import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import {
  DIRECTORY_KIND_LABEL,
  createDirectoryListing,
  deleteDirectoryListing,
  listDirectory,
} from '@/features/community/services/directory.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { DirectoryKind, DirectoryListing } from '@/shared/types/domain';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

function parseKind(raw: string | undefined): DirectoryKind {
  if (raw === 'table' || raw === 'referee' || raw === 'organiser' || raw === 'club') {
    return raw;
  }
  return 'club';
}

const ADD_LABEL: Record<DirectoryKind, string> = {
  club: 'Add club',
  table: 'Add table',
  referee: 'Add referee',
  organiser: 'Add organiser',
};

export default function DirectoryScreen(): ReactNode {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = parseKind(kindParam);
  const { user } = useSession();
  const [rows, setRows] = useState<DirectoryListing[]>([]);
  const [compose, setCompose] = useState(false);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  const cityId = user?.cityId ?? null;
  const heading = DIRECTORY_KIND_LABEL[kind];

  const reload = useCallback(async () => {
    if (!cityId) {
      setRows([]);
      return;
    }
    setRows(await listDirectory({ cityId, kind }));
  }, [cityId, kind]);

  useStoreReload(reload, cityId ? `directory:${cityId}:${kind}` : null);

  async function save(): Promise<void> {
    if (!user?.cityId || !user.cityName) {
      return;
    }
    setBusy(true);
    try {
      await createDirectoryListing({
        cityId: user.cityId,
        cityName: user.cityName,
        kind,
        name,
        detail,
      });
      setName('');
      setDetail('');
      setCompose(false);
    } catch (error) {
      Alert.alert('Could not add listing', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return null;
  }

  if (!cityId) {
    return (
      <Screen>
        <Text style={typography.title}>{heading}</Text>
        <Text style={typography.subtitle}>Pick your city to browse the local directory.</Text>
        <Button label="Choose city" onPress={() => router.push('/location')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={typography.label}>{user.cityName}</Text>
      <Text style={typography.title}>{heading}</Text>
      <Text style={styles.lead}>Add a club, table, referee, or organiser others can find.</Text>

      <Button
        label={compose ? 'Cancel' : ADD_LABEL[kind]}
        variant={compose ? 'secondary' : 'primary'}
        onPress={() => setCompose((v) => !v)}
      />

      {compose ? (
        <View style={styles.compose}>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Green baize club"
          />
          <TextField
            label="Details"
            value={detail}
            onChangeText={setDetail}
            placeholder="Area, hours, contact…"
          />
          <Button label="Save" onPress={() => void save()} loading={busy} disabled={busy} />
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text style={styles.empty}>Nothing listed yet in this city.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.name}>{row.name}</Text>
            {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
            {row.createdByUid === user.uid ? (
              <Button
                label="Remove"
                variant="ghost"
                onPress={() => {
                  void deleteDirectoryListing(row.id).catch((error: unknown) => {
                    Alert.alert('Could not remove', toUserMessage(error));
                  });
                }}
              />
            ) : null}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  compose: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginTop: spacing.lg,
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  name: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  detail: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
  },
});
