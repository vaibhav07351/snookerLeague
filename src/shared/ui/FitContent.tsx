import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

interface FitContentProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Fills the space it is given and lets children stretch into it. It only scrolls when the
 * content truly cannot fit (very small phones, large system text), so nothing is clipped.
 */
export function FitContent({ children, style, contentStyle }: FitContentProps): ReactNode {
  const [boxHeight, setBoxHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const overflows = boxHeight > 0 && contentHeight > boxHeight + 1;

  return (
    <ScrollView
      style={[styles.flex, Platform.OS === 'web' ? styles.webScroll : null, style]}
      contentContainerStyle={[styles.grow, contentStyle]}
      scrollEnabled={overflows}
      showsVerticalScrollIndicator={overflows}
      onLayout={(e) => setBoxHeight(e.nativeEvent.layout.height)}
      onContentSizeChange={(_w, h) => setContentHeight(h)}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // RN Web: flex:1 alone can disable scrolling; a zero base height restores it.
  webScroll: {
    height: 0,
  },
  grow: {
    flexGrow: 1,
  },
});
