import { Redirect } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { readPendingInvite } from '@/features/league/services/invite-link.service';
import { usePalette } from '@/theme/ThemeProvider';

/** Start gate: sign-in, then birthday, city, a saved invite, a league, and finally the app. */
export default function Index(): ReactNode {
  const { ready, user, league } = useSession();
  const palette = usePalette();
  const [pendingInvite, setPendingInvite] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void readPendingInvite().then((code) => {
      if (!cancelled) {
        setPendingInvite(code);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || pendingInvite === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!user.dateOfBirth) {
    return <Redirect href="/birthday" />;
  }

  const needsCity = !user.isDemo && !user.cityId;
  const demoNeedsCity = user.isDemo && !user.cityId && user.citySkipped !== true;
  if (needsCity || demoNeedsCity) {
    return <Redirect href="/location" />;
  }

  // An invite opened before signing in continues here (demo users must link Google first).
  if (pendingInvite && !user.isDemo) {
    return <Redirect href={{ pathname: '/join/[code]', params: { code: pendingInvite } }} />;
  }

  if (!league) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(main)" />;
}
