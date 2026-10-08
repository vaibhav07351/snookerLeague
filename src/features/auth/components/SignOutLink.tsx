import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { Button } from '@/features/home/components/Button';
import { toUserMessage } from '@/shared/errors/app-error';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';

/** Escape hatch on first-run setup screens (wrong account, changed mind). */
export function SignOutLink({ label = 'Log out' }: { label?: string }): ReactNode {
  const { refresh } = useSession();

  async function signOut(): Promise<void> {
    const ok = await confirmAction(
      'Log out?',
      'You can sign in again with another account.',
      'Log out',
    );
    if (!ok) {
      return;
    }
    try {
      await authService.signOut();
      await refresh();
      router.replace('/login');
    } catch (error) {
      notify.error('Could not log out', toUserMessage(error));
    }
  }

  return (
    <Button
      label={label}
      variant="ghost"
      size="sm"
      icon="log-out-outline"
      onPress={() => void signOut()}
    />
  );
}
