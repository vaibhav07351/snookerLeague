import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { CITY_LETTERS } from '@/features/location/data/india-cities';
import * as locationService from '@/features/location/services/location.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function LocationScreen(): ReactNode {
  const { user, refresh } = useSession();
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

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
      await locationService.setUserCity(cityId);
      await refresh();
      router.replace('/');
    } catch (error) {
      Alert.alert('Could not save city', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function suggestFromDevice(): Promise<void> {
    setSuggesting(true);
    try {
      const city = await locationService.suggestCityFromDevice();
      if (!city) {
        Alert.alert(
          'Pick a city',
          'We could not match your location to a city. Search the list instead.',
        );
        return;
      }
      await pick(city.id);
    } catch (error) {
      Alert.alert('Location unavailable', toUserMessage(error));
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
      Alert.alert('Could not skip', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandWordmark size="md" />
      <Text style={[typography.title, styles.title]}>Where do you play?</Text>
      <Text style={styles.sub}>
        We use your city for local players, live matches, and city rankings. We store the city, not
        a live GPS trail.
      </Text>
      <Button
        label={suggesting ? 'Finding city…' : 'Use my location'}
        onPress={() => void suggestFromDevice()}
        disabled={busy || suggesting}
        loading={suggesting}
      />
      <TextField
        label="Search city"
        value={query}
        onChangeText={setQuery}
        placeholder="Meerut, Mumbai…"
        autoCorrect={false}
      />
      <View style={styles.letters}>
        {CITY_LETTERS.map((ch) => (
          <Pressable
            key={ch}
            onPress={() => setLetter((prev) => (prev === ch ? null : ch))}
            style={[styles.letter, letter === ch && styles.letterOn]}
          >
            <Text style={[styles.letterText, letter === ch && styles.letterTextOn]}>{ch}</Text>
          </Pressable>
        ))}
      </View>
      {cities.map((c) => (
        <Pressable key={c.id} disabled={busy} onPress={() => void pick(c.id)} style={styles.row}>
          <Text style={styles.city}>{c.name}</Text>
          <Text style={styles.state}>{c.state}</Text>
        </Pressable>
      ))}
      {user?.isDemo ? (
        <Button
          label="Skip for now"
          variant="secondary"
          onPress={() => void skip()}
          disabled={busy}
          style={styles.skip}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
  },
  sub: {
    ...typography.subtitle,
    marginBottom: spacing.lg,
  },
  letters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.md,
  },
  letter: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  letterOn: {
    backgroundColor: colors.gold,
  },
  letterText: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 11,
  },
  letterTextOn: {
    color: colors.felt,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  city: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  state: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  skip: {
    marginTop: spacing.xl,
  },
});
