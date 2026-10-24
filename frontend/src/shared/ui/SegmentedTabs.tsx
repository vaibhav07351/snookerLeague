import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
}

interface SegmentedTabsProps<K extends string> {
  items: ReadonlyArray<SegmentItem<K>>;
  value: K;
  onChange: (key: K) => void;
  /** 'sm' for a second, lighter row of tabs under a main one. */
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}

/** Equal-width tab strip: switches what one area of the screen shows. */
export function SegmentedTabs<K extends string>({
  items,
  value,
  onChange,
  size = 'md',
  style,
}: SegmentedTabsProps<K>): ReactNode {
  const styles = useStyles(makeStyles);
  const small = size === 'sm';
  return (
    <View style={[styles.wrap, style]} accessibilityRole="tablist">
      {items.map((item) => {
        const on = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.tab,
              small && styles.tabSmall,
              on && (small ? styles.tabOnSmall : styles.tabOn),
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.text,
                small && styles.textSmall,
                on && (small ? styles.textOnSmall : styles.textOn),
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radii.sm,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      minHeight: TOUCH_TARGET - spacing.xs,
      paddingHorizontal: 2,
      borderRadius: radii.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabSmall: {
      minHeight: 34,
    },
    tabOn: {
      backgroundColor: c.primary,
    },
    tabOnSmall: {
      backgroundColor: c.cardHighlight,
    },
    pressed: {
      opacity: 0.85,
    },
    text: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 13,
    },
    textSmall: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
    },
    textOn: {
      color: c.onPrimary,
    },
    textOnSmall: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
    },
  });
