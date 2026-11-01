import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WEB_SHELL_MAX_WIDTH } from '@/shared/hooks/use-layout';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Panel that slides up over the screen for detail, pickers and secondary actions, so the
 * screen underneath can stay a single, scroll-free view. Long content scrolls inside.
 */
export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* iOS needs padding to lift fields inside the sheet; Android resizes the modal window. */}
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={22} color={palette.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: c.overlay,
    },
    sheet: {
      width: '100%',
      maxWidth: WEB_SHELL_MAX_WIDTH,
      maxHeight: '85%',
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.border,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: c.borderStrong,
      marginTop: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
    },
    title: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
    },
    close: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
    scroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
  });
