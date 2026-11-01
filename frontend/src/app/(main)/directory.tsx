import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { SafetyActions } from '@/features/community/components/SafetyActions';
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
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

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
  const palette = usePalette();
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
      <View style={styles.topRow}>
        <View style={styles.flex}>
          <Text style={typography.label} numberOfLines={1}>
            {user.cityName}
          </Text>
          <Text style={typography.title} numberOfLines={1}>
            {heading}
          </Text>
        </View>
        <Button
          label={compose ? 'Cancel' : 'Add'}
          icon={compose ? 'close' : 'add'}
          size="sm"
          variant={compose ? 'secondary' : 'primary'}
          accessibilityLabel={compose ? 'Cancel' : ADD_LABEL[kind]}
          onPress={() => setCompose((v) => !v)}
        />
      </View>

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
            <Card key={row.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{row.name}</Text>
                {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
              </View>
              {row.createdByUid === user.uid ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${row.name}`}
                  hitSlop={4}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                  onPress={() => {
                    void deleteDirectoryListing(row.id).catch((error: unknown) => {
                      notify.error('Could not remove', toUserMessage(error));
                    });
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={palette.textMuted} />
                </Pressable>
              ) : (
                <SafetyActions
                  compact
                  targetKind="directory"
                  targetId={row.id}
                  targetUid={row.createdByUid}
                  name={row.name}
                />
              )}
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
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    flex: {
      flex: 1,
      minWidth: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconBtn: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: -spacing.sm,
      marginRight: -spacing.sm,
    },
    pressed: {
      opacity: 0.6,
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
  });
