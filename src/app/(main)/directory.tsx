import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, type Palette } from '@/theme/tokens';

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
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
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
      notify.error('Could not add listing', toUserMessage(error));
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
        <Text style={[typography.title, styles.heading]}>{heading}</Text>
        <EmptyState
          icon="location-outline"
          title="Pick your city"
          message="Choose a city to browse the local directory."
          actionLabel="Choose city"
          onAction={() => router.push('/location')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={typography.label} numberOfLines={1}>
        {user.cityName}
      </Text>
      <Text style={typography.title}>{heading}</Text>
      <Text style={styles.lead}>Add a club, table, referee or organiser others can find.</Text>

      <Button
        label={compose ? 'Cancel' : ADD_LABEL[kind]}
        icon={compose ? 'close' : 'add'}
        variant={compose ? 'secondary' : 'primary'}
        onPress={() => setCompose((v) => !v)}
      />

      {compose ? (
        <Card style={styles.compose}>
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
            placeholder="Area, hours, contact"
          />
          <Button label="Save" onPress={() => void save()} loading={busy} disabled={busy} />
        </Card>
      ) : null}

      <View style={styles.list}>
        {rows.length === 0 ? (
          <EmptyState
            icon="map-outline"
            title="Nothing listed yet"
            message={`Be the first to add one in ${user.cityName ?? 'this city'}.`}
          />
        ) : (
          rows.map((row) => (
            <Card key={row.id}>
              <Text style={styles.name}>{row.name}</Text>
              {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
              {row.createdByUid === user.uid ? (
                <Button
                  label="Remove"
                  icon="trash-outline"
                  variant="ghost"
                  size="sm"
                  style={styles.remove}
                  onPress={() => {
                    void deleteDirectoryListing(row.id).catch((error: unknown) => {
                      notify.error('Could not remove', toUserMessage(error));
                    });
                  }}
                />
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    heading: {
      marginBottom: spacing.md,
    },
    lead: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    compose: {
      marginTop: spacing.md,
    },
    list: {
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    name: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    detail: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    remove: {
      alignSelf: 'flex-end',
    },
  });
