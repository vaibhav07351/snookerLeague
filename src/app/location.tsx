import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/features/home/components/Button';
import { SignOutLink } from '@/features/auth/components/SignOutLink';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { CITY_LETTERS } from '@/features/location/data/india-cities';
import * as locationService from '@/features/location/services/location.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSafeBack } from '@/shared/ui/HeaderBack';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

export default function LocationScreen(): ReactNode {
  const { user, refresh } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const goBack = useSafeBack('/(main)/profile');
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  // A city (or a demo skip) is already on file: this screen was opened to change it.
  const isEditing = Boolean(user?.cityId) || user?.citySkipped === true;
  const currentCityId = user?.cityId ?? null;
  const currentCity = currentCityId ? locationService.getCityById(currentCityId) : null;

  const cities = useMemo(() => {
    const searched = locationService.searchCities(query);
    if (!letter) {
      return searched;
    }
    return searched.filter((c) => c.name.toUpperCase().startsWith(letter));
  }, [query, letter]);

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

  async function suggestFromDevice(): Promise<void> {
    setSuggesting(true);
    try {
      const city = await locationService.suggestCityFromDevice();
      await pick(city.id);
    } catch (error) {
      notify.error('Location unavailable', toUserMessage(error));
    } finally {
      setSuggesting(false);
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

  function clearFilters(): void {
    setQuery('');
    setLetter(null);
  }

  return (
    <Screen>
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
        We use your city for local players, live matches, and city rankings. We store the city, not
        a live GPS trail.
      </Text>
      {currentCity ? (
        <Card tone="highlight" style={styles.current}>
          <Ionicons name="location" size={18} color={palette.primary} />
          <View style={styles.currentCopy}>
            <Text style={typography.label}>Current city</Text>
            <Text style={styles.currentName} numberOfLines={1}>
              {currentCity.name}, {currentCity.state}
            </Text>
          </View>
        </Card>
      ) : null}
      <Button
        label={suggesting ? 'Finding city…' : 'Use my location'}
        icon="navigate"
        onPress={() => void suggestFromDevice()}
        disabled={busy || suggesting}
        loading={suggesting}
        style={styles.locate}
      />
      <TextField
        label="Or search for a city"
        value={query}
        onChangeText={setQuery}
        placeholder="Meerut, Mumbai…"
        autoCorrect={false}
      />
      <View style={styles.letters}>
        {CITY_LETTERS.map((ch) => {
          const on = letter === ch;
          return (
            <Pressable
              key={ch}
              accessibilityRole="button"
              accessibilityLabel={`Cities starting with ${ch}`}
              accessibilityState={{ selected: on }}
              hitSlop={3}
              onPress={() => setLetter((prev) => (prev === ch ? null : ch))}
              style={[styles.letter, on && styles.letterOn]}
            >
              <Text style={[styles.letterText, on && styles.letterTextOn]}>{ch}</Text>
            </Pressable>
          );
        })}
      </View>
      {cities.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No cities match"
          message="Try a different spelling or clear the letter filter."
          actionLabel="Clear search"
          onAction={clearFilters}
        />
      ) : (
        <Card style={styles.list}>
          {cities.map((c, index) => {
            const isCurrent = c.id === currentCityId;
            return (
              <Pressable
                key={c.id}
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
          })}
        </Card>
      )}
      {user?.isDemo && !isEditing ? (
        <Button
          label="Skip for now"
          variant="ghost"
          onPress={() => void skip()}
          disabled={busy}
          style={styles.skip}
        />
      ) : null}
      {!isEditing ? <SignOutLink /> : null}
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
      fontSize: 16,
    },
    pressed: {
      opacity: 0.7,
    },
    title: {
      marginTop: spacing.md,
    },
    sub: {
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    current: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    currentCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    currentName: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    locate: {
      marginBottom: spacing.lg,
    },
    letters: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: spacing.md,
    },
    letter: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.xs,
      backgroundColor: c.card,
    },
    letterOn: {
      backgroundColor: c.primary,
    },
    letterText: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 12,
    },
    letterTextOn: {
      color: c.onPrimary,
    },
    list: {
      paddingVertical: 0,
      paddingHorizontal: 0,
      gap: 0,
      overflow: 'hidden',
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
      fontSize: 16,
    },
    cityCurrent: {
      color: c.primary,
    },
    state: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    skip: {
      marginTop: spacing.lg,
    },
  });
