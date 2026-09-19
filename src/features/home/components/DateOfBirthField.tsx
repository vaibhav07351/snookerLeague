import { useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  divisionFromDob,
  divisionLabel,
  formatIsoDate,
  parseIsoDate,
} from '@/features/auth/services/division.service';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

interface DateOfBirthFieldProps {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
}

function partsFromIso(iso: string): { day: string; month: string; year: string } {
  const parsed = parseIsoDate(iso);
  if (!parsed) {
    return { day: '', month: '', year: '' };
  }
  return {
    day: String(parsed.getDate()).padStart(2, '0'),
    month: String(parsed.getMonth() + 1).padStart(2, '0'),
    year: String(parsed.getFullYear()),
  };
}

export function DateOfBirthField({ value, onChange, error }: DateOfBirthFieldProps): ReactNode {
  const initial = partsFromIso(value);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  function emit(nextDay: string, nextMonth: string, nextYear: string): void {
    if (nextDay.length < 2 || nextMonth.length < 2 || nextYear.length < 4) {
      onChange('');
      return;
    }
    const iso = formatIsoDate(Number(nextYear), Number(nextMonth), Number(nextDay));
    onChange(parseIsoDate(iso) ? iso : '');
  }

  const preview = useMemo(() => {
    const division = value ? divisionFromDob(value) : null;
    if (!division) {
      return 'Used for Under 16 / Open / Masters tables in your city.';
    }
    return `You play in ${divisionLabel(division)}.`;
  }, [value]);

  return (
    <View style={styles.wrap}>
      <Text style={typography.label}>Date of birth</Text>
      <View style={styles.row}>
        <TextInput
          ref={dayRef}
          value={day}
          onChangeText={(t) => {
            const next = t.replace(/\D/g, '').slice(0, 2);
            setDay(next);
            emit(next, month, year);
            if (next.length === 2) {
              monthRef.current?.focus();
            }
          }}
          placeholder="DD"
          placeholderTextColor={colors.chalkMuted}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="next"
          style={[styles.input, error ? styles.inputError : null]}
        />
        <TextInput
          ref={monthRef}
          value={month}
          onChangeText={(t) => {
            const next = t.replace(/\D/g, '').slice(0, 2);
            setMonth(next);
            emit(day, next, year);
            if (next.length === 2) {
              yearRef.current?.focus();
            }
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && month.length === 0) {
              dayRef.current?.focus();
            }
          }}
          placeholder="MM"
          placeholderTextColor={colors.chalkMuted}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="next"
          style={[styles.input, error ? styles.inputError : null]}
        />
        <TextInput
          ref={yearRef}
          value={year}
          onChangeText={(t) => {
            const next = t.replace(/\D/g, '').slice(0, 4);
            setYear(next);
            emit(day, month, next);
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && year.length === 0) {
              monthRef.current?.focus();
            }
          }}
          placeholder="YYYY"
          placeholderTextColor={colors.chalkMuted}
          keyboardType="number-pad"
          maxLength={4}
          style={[styles.input, styles.year, error ? styles.inputError : null]}
        />
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <Text style={styles.hint}>{preview}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.chalk,
    fontSize: 17,
    fontFamily: fonts.body,
    minHeight: 52,
    textAlign: 'center',
  },
  year: {
    flex: 1.4,
  },
  inputError: {
    borderColor: colors.danger,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.chalkMuted,
    lineHeight: 18,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
  },
});
