import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FormResult } from '@/features/stats/services/rating.service';
import { usePalette } from '@/theme/ThemeProvider';

interface FormPipsProps {
  form: FormResult[];
  /** Show at most this many, newest on the right. */
  max?: number;
  size?: number;
}

function word(result: FormResult): string {
  return result === 1 ? 'won' : result === -1 ? 'forfeited' : 'lost';
}

/** Compact recent form: filled = win, hollow = loss, ringed red = forfeit loss. */
export function FormPips({ form, max = 5, size = 9 }: FormPipsProps): ReactNode {
  const palette = usePalette();
  const shown = form.slice(-max);
  if (shown.length === 0) {
    return null;
  }
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Recent form, newest last: ${shown.map(word).join(', ')}`}
    >
      {shown.map((result, i) => (
        <View
          key={`${i}-${result}`}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: result === 1 ? palette.success : palette.danger,
            backgroundColor:
              result === 1 ? palette.success : result === -1 ? palette.dangerSoft : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
