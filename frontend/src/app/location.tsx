import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/shared/ui/Button';
import { SignOutLink } from '@/features/auth/components/SignOutLink';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { useCityPicker } from '@/features/location/hooks/use-city-picker';
import * as locationService from '@/features/location/services/location.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSafeBack } from '@/shared/ui/HeaderBack';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import {
  TOUCH_TARGET,
  fonts,
  makeTypography,
  radii,
  spacing,
  typeScale,
  type Palette,
} from '@/theme/tokens';

export default function LocationScreen(): ReactNode {
  const { user, refresh } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const goBack = useSafeBack('/(main)/profile');
  const picker = useCityPicker();
  const { detection } = picker;
  const [busy, setBusy] = useState(false);
  // A city (or a demo skip) is already on file: this screen was opened to change it.
  const isEditing = Boolean(user?.cityId) || user?.citySkipped === true;
  const currentCityId = user?.cityId ?? null;
  const currentCity = currentCityId ? locationService.getCityById(currentCityId) : null;
  const detected = detection.status === 'found' ? detection.result.city : null;

  async function pick(cityId: string): Promise<void> {
    setBusy(true);
    try {
      const city = await locationService.setUserCity(cityId);
      await refresh();
      if (isEditing) {
        notify.success('City updated', city.name);
        goBack();
        return;
      }
      router.replace('/');
    } catch (error) {
      notify.error('Could not save city', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function skip(): Promise<void> {
    if (!user?.isDemo) {
      return;
    }
    setBusy(true);
    try {
      await locationService.skipCityForDemo();
      await refresh();
      router.replace('/');
    } catch (error) {
      notify.error('Could not skip', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll={false}
      footer={
        !isEditing ? (
          <View style={styles.footer}>
            {user?.isDemo ? (
              <Button
                label="Skip for now"
                variant="ghost"
                size="sm"
                onPress={() => void skip()}
                disabled={busy}
              />
            ) : null}
            <SignOutLink />
          </View>
        ) : undefined
      }
    >
      {isEditing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
          hitSlop={8}
          onPress={goBack}
          disabled={busy}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={palette.text} />
          <Text style={styles.backText}>Cancel</Text>
        </Pressable>
      ) : (
        <BrandWordmark size="md" />
      )}
      <Text style={[typography.title, styles.title]}>
        {isEditing ? 'Change your city' : 'Where do you play?'}
      </Text>
      <Text style={[typography.subtitle, styles.sub]}>
        {currentCity
          ? `Now: ${currentCity.name}, ${currentCity.state}`
          : 'For local players and city rankings. We save the town, never your GPS.'}
      </Text>

      {detected ? (
        <View style={styles.detected}>
          <Ionicons name="location" size={20} color={palette.primary} />
          <View style={styles.rowCopy}>
            <Text style={styles.city} numberOfLines={1}>
              {detected.name}
            </Text>
            <Text style={styles.state} numberOfLines={1}>
              {detected.id === currentCityId ? 'Your city now' : `${detected.state}, near you`}
            </Text>
          </View>
          {detected.id === currentCityId ? (
            <Ionicons name="checkmark-circle" size={22} color={palette.primary} />
          ) : (
            <Button
              label="Use this"
              size="sm"
              onPress={() => void pick(detected.id)}
              disabled={busy}
              accessibilityLabel={`Use ${detected.name}, ${detected.state}`}
            />
          )}
        </View>
      ) : (
        <View style={styles.locate}>
          <Button
            label={detection.status === 'detecting' ? 'Finding your town...' : 'Use my location'}
            icon="navigate"
            variant="secondary"
            onPress={() => void picker.detect()}
            disabled={busy}
            loading={detection.status === 'detecting'}
          />
          {detection.status === 'failed' ? (
            <Text style={styles.detectError} accessibilityLiveRegion="polite">
              {detection.message}
            </Text>
          ) : null}
        </View>
      )}

      <TextField
        label="Search your town"
        value={picker.query}
        onChangeText={picker.setQuery}
        placeholder="Bijnor, Meerut, Mumbai..."
        autoCorrect={false}
        autoCapitalize="words"
      />
      {picker.cities.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No town matches"
          message="Check the spelling, or pick the nearest bigger town."
          actionLabel="Clear search"
          onAction={() => picker.setQuery('')}
        />
      ) : (
        <>
          <Text style={[typography.label, styles.listLabel]}>{picker.listLabel}</Text>
          <FlatList
            data={picker.cities}
            keyExtractor={(c) => c.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={15}
            ListFooterComponent={
              <Text style={[typography.caption, styles.credit]}>Town data: GeoNames (CC BY)</Text>
            }
            renderItem={({ item: c, index }) => {
              const isCurrent = c.id === currentCityId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}, ${c.state}`}
                  disabled={busy}
                  onPress={() => void pick(c.id)}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && styles.rowDivider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowCopy}>
                    <Text style={[styles.city, isCurrent && styles.cityCurrent]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.state} numberOfLines={1}>
                      {c.state}
                    </Text>
                  </View>
                  {isCurrent ? (
                    <Ionicons name="checkmark-circle" size={20} color={palette.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
                  )}
                </Pressable>
              );
            }}
          />
        </>
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    back: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: TOUCH_TARGET,
      paddingRight: spacing.sm,
      marginLeft: -6,
      gap: 2,
    },
    backText: {
      fontFamily: fonts.bodyMedium,
      color: c.text,
      fontSize: typeScale.lead,
    },
    pressed: {
      opacity: 0.7,
    },
    title: {
      marginTop: spacing.md,
    },
    sub: {
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    locate: {
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    detectError: {
      fontFamily: fonts.body,
      color: c.danger,
      fontSize: typeScale.small,
      lineHeight: 18,
    },
    detected: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 64,
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    listLabel: {
      marginBottom: spacing.xs,
    },
    list: {
      flex: 1,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    credit: {
      textAlign: 'center',
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 56,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowPressed: {
      backgroundColor: c.cardRaised,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
    },
    city: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.lead,
    },
    cityCurrent: {
      color: c.primary,
    },
    state: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.caption,
      marginTop: 2,
    },
  });
