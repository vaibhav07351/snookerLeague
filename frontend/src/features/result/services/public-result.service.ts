import { z } from 'zod';

import { presentLines } from '@/features/result/services/result-view';
import type { ResultKind, ResultView } from '@/features/result/types/result.types';
import { getPublicResult } from '@/shared/api/public-api';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';

/** The server's public result (backend/internal/public/results.go). */
const publicResultSchema = z.object({
  kind: z.enum(['match', 'race', 'group']),
  id: z.string().min(1),
  label: z.string(),
  caption: z.string(),
  league: z.string(),
  when: z.string(),
  live: z.boolean(),
  status: z.string(),
  sideA: z.string().optional(),
  sideB: z.string().optional(),
  framesA: z.number().int().nonnegative(),
  framesB: z.number().int().nonnegative(),
  winner: z.enum(['a', 'b', '']).optional(),
  standings: z
    .array(
      z.object({
        place: z.string(),
        name: z.string(),
        detail: z.string(),
        winner: z.boolean(),
      }),
    )
    .max(64)
    .optional(),
});

export type PublicResult = z.infer<typeof publicResultSchema>;

/** A public result as the shared result card shows it. */
export function publicResultView(r: PublicResult): ResultView {
  const standings = r.standings ?? [];
  const metaNote = presentLines([r.league ? `${r.league} · ${r.when}` : r.when || null]);
  if (r.kind === 'match') {
    const sideA = r.sideA ?? 'Player';
    const sideB = r.sideB ?? 'Player';
    const winner = r.winner === 'a' || r.winner === 'b' ? r.winner : null;
    const forfeit = r.status !== '';
    return {
      kind: 'match',
      id: r.id,
      kicker: r.live ? 'Live now' : forfeit ? 'Forfeit result' : 'Match result',
      label: r.label,
      caption: r.caption || null,
      mood: forfeit ? 'forfeit' : 'win',
      live: r.live,
      score: `${r.framesA}-${r.framesB}`,
      scoreUnit: null,
      winnerLabel: winner === 'a' ? sideA : winner === 'b' ? sideB : null,
      winnerHeading: (winner === 'a' ? sideA : sideB).includes(' & ') ? 'Winners' : 'Winner',
      sides: { a: sideA, b: sideB, framesA: r.framesA, framesB: r.framesB, winner },
      standings: [],
      notes: metaNote,
      summary: `${sideA} ${r.framesA} - ${r.framesB} ${sideB}`,
    };
  }
  const top = standings.find((s) => s.winner) ?? null;
  return {
    kind: r.kind,
    id: r.id,
    kicker: r.live ? 'Live now' : r.kind === 'race' ? 'Race result' : 'Free-for-all result',
    label: r.label,
    caption: r.caption || null,
    mood: 'win',
    live: r.live,
    // The card's big figure is the winner's line ("52 pts"); while live, the leader's.
    score: (top ?? standings[0])?.detail ?? '-',
    scoreUnit: null,
    winnerLabel: top?.name ?? null,
    winnerHeading: 'Winner',
    sides: null,
    standings,
    notes: metaNote,
    summary: top ? `${top.name} wins: ${r.label}` : r.label,
  };
}

/**
 * Load a game's public result for someone who cannot see it on this phone (not in the
 * league, or not synced yet). Resolves null when it does not exist; throws a typed error
 * when it cannot be loaded or the server's answer has an unexpected shape.
 */
export async function loadPublicResult(kind: ResultKind, id: string): Promise<ResultView | null> {
  const raw = await getPublicResult(kind, id);
  if (raw === null) {
    return null;
  }
  const parsed = publicResultSchema.safeParse(raw);
  if (!parsed.success || parsed.data.kind !== kind) {
    logger.error('public-result', 'Unexpected public result shape', {
      kind,
      issues: parsed.success ? 'kind mismatch' : parsed.error.issues.length,
    });
    throw new AppError('BAD_RESULT', 'This result could not be read.');
  }
  return publicResultView(parsed.data);
}
