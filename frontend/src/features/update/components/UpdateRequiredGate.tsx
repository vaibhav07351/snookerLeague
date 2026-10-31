import { useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { openPlayStoreListing } from '@/features/community/services/share.service';
import { isUpdateRequired } from '@/features/update/services/version.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { makeTypography, spacing, type Palette } from '@/theme/tokens';

/**
 * Shows "Update required" instead of the app when the server no longer supports this build
 * (GET /v1/config minVersion). Checked at start and whenever the app comes back to the front.
 */
export function UpdateRequiredGate({ children }: { children: ReactNode }): ReactNode {
  const [blocked, setBlocked] = useState(false);
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);

  useEffect(() => {
    let alive = true;
    const check = (): void => {
      void isUpdateRequired().then((required) => {
        if (alive) {
          setBlocked(required);
        }
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!blocked) {
    return children;
  }
  return (
    <View style={styles.root}>
      <BrandLogo size={96} />
      <Text style={typography.title}>Update required</Text>
      <Text style={[typography.subtitle, styles.body]}>
        This version of Snookit is too old to sync. Update from the Play Store to keep scoring with
        your league.
      </Text>
      <Button
        label="Open Play Store"
        icon="download-outline"
        onPress={() => {
          openPlayStoreListing().catch((error: unknown) => {
            notify.error('Could not open the Play Store', toUserMessage(error));
          });
        }}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: c.bg,
    },
    body: {
      textAlign: 'center',
    },
  });
