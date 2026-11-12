import type { ResultRow } from '@/features/result/types/result.types';

/** A break worth putting on a result card. */
export const NOTABLE_BREAK = 50;

/** "Highest break 52" when the game's best break is notable, else null. */
export function breakNote(highestBreak: number): string | null {
  return highestBreak >= NOTABLE_BREAK ? `Highest break ${highestBreak}` : null;
}

/** "1 frame", "3 frames". */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The winning row's name, or null when nobody has won (yet). */
export function winnerName(rows: readonly ResultRow[]): string | null {
  return rows.find((r) => r.winner)?.name ?? null;
}

/** Drops the nulls from a list of optional lines. */
export function presentLines(lines: readonly (string | null)[]): string[] {
  return lines.filter((l): l is string => l !== null);
}
