import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import {
  clearPendingInvite,
  savePendingInvite,
} from '@/features/league/services/invite-link.service';
import * as leagueService from '@/features/league/services/league.service';
import * as playersService from '@/features/players/services/players.service';
import { AppError, toUserMessage } from '@/shared/errors/app-error';
import type { Player } from '@/shared/types/domain';

export type JoinStep =
  | { kind: 'loading' }
  /** Signed out, or setup (birthday / city) unfinished: continue after the gate. */
  | { kind: 'needs-setup' }
  | { kind: 'needs-account'; message: string }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'joinable'; leagueName: string }
  | { kind: 'pick-player'; leagueId: string; leagueName: string; guests: Player[] }
  | { kind: 'done'; leagueName: string };

export interface JoinLeagueState {
  step: JoinStep;
  busy: boolean;
  join: () => Promise<void>;
  claim: (playerId: string) => Promise<void>;
  createOwn: (displayName: string) => Promise<void>;
  retry: () => void;
}

/** Drives the /join/[code] screen: preview, join, then "which player are you". */
export function useJoinLeague(rawCode: string | undefined): JoinLeagueState {
  const { ready, user, refresh } = useSession();
  const [step, setStep] = useState<JoinStep>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const code = (rawCode ?? '').trim().toUpperCase();
  const uid = user?.uid ?? null;
  const needsSetup =
    !user ||
    !user.dateOfBirth ||
    (!user.isDemo && !user.cityId) ||
    (user.isDemo && !user.cityId && user.citySkipped !== true);

  const toPlayerStep = useCallback(async (leagueId: string, leagueName: string): Promise<void> => {
    const guests = await playersService.listClaimablePlayers(leagueId);
    setStep({ kind: 'pick-player', leagueId, leagueName, guests });
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    let cancelled = false;
    void (async () => {
      if (needsSetup || !uid) {
        if (code) {
          await savePendingInvite(code);
        }
        if (!cancelled) {
          setStep({ kind: 'needs-setup' });
        }
        return;
      }
      setStep({ kind: 'loading' });
      // The saved invite brought them here and the code is in the URL now: clear it so
      // "Not now" or an error never sends them back to this screen on every launch.
      await clearPendingInvite();
      try {
        const preview = await leagueService.previewInvite(code, uid);
        if (cancelled) {
          return;
        }
        if (preview.status === 'member') {
          if (preview.hasPlayer) {
            await leagueService.setActiveLeague(preview.league.id, uid);
            await clearPendingInvite();
            await refresh();
            if (!cancelled) {
              setStep({ kind: 'done', leagueName: preview.league.name });
            }
          } else {
            await toPlayerStep(preview.league.id, preview.league.name);
          }
          return;
        }
        setStep({ kind: 'joinable', leagueName: preview.leagueName });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof AppError && error.code === 'NEEDS_ACCOUNT') {
          await savePendingInvite(code);
          setStep({ kind: 'needs-account', message: error.message });
          return;
        }
        const retryable =
          error instanceof AppError && (error.code === 'NETWORK' || error.code === 'OFFLINE');
        setStep({ kind: 'error', message: toUserMessage(error), retryable });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, needsSetup, uid, code, attempt, refresh, toPlayerStep]);

  const join = useCallback(async () => {
    if (!uid) {
      return;
    }
    setBusy(true);
    try {
      const league = await leagueService.joinLeague({ code, uid });
      await refresh();
      const hasPlayer = (await playersService.getPlayerByAuthUid(league.id, uid)) != null;
      if (hasPlayer) {
        await clearPendingInvite();
        setStep({ kind: 'done', leagueName: league.name });
      } else {
        await toPlayerStep(league.id, league.name);
      }
    } catch (error) {
      const retryable =
        error instanceof AppError && (error.code === 'NETWORK' || error.code === 'OFFLINE');
      setStep({ kind: 'error', message: toUserMessage(error), retryable });
    } finally {
      setBusy(false);
    }
  }, [code, uid, refresh, toPlayerStep]);

  const finishWith = useCallback(
    async (action: (leagueId: string) => Promise<unknown>) => {
      if (step.kind !== 'pick-player' || !uid) {
        return;
      }
      setBusy(true);
      try {
        await action(step.leagueId);
        await leagueService.setActiveLeague(step.leagueId, uid);
        await clearPendingInvite();
        await refresh();
        setStep({ kind: 'done', leagueName: step.leagueName });
      } catch (error) {
        // Stay on the picker so they can choose again (e.g. someone claimed that card first).
        await toPlayerStep(step.leagueId, step.leagueName);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [step, uid, refresh, toPlayerStep],
  );

  const claim = useCallback(
    (playerId: string) =>
      finishWith(() =>
        playersService.claimPlayer({ playerId, uid: uid ?? '', photoUrl: user?.photoUrl ?? null }),
      ),
    [finishWith, uid, user?.photoUrl],
  );

  const createOwn = useCallback(
    (displayName: string) =>
      finishWith((leagueId) =>
        playersService.createOwnPlayer({
          leagueId,
          uid: uid ?? '',
          displayName,
          photoUrl: user?.photoUrl ?? null,
        }),
      ),
    [finishWith, uid, user?.photoUrl],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { step, busy, join, claim, createOwn, retry };
}
