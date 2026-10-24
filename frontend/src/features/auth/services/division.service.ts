import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import type { SnookerDivision } from '@/shared/types/domain';

export const SNOOKER_DIVISIONS: SnookerDivision[] = [
  'u16',
  'u18',
  'u21',
  'open',
  'masters',
  'seniors',
];

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
  .refine((value) => {
    const parsed = parseIsoDate(value);
    return parsed != null;
  }, 'Enter a valid date');

export function isSnookerDivision(value: unknown): value is SnookerDivision {
  return typeof value === 'string' && (SNOOKER_DIVISIONS as string[]).includes(value);
}

/** Parse YYYY-MM-DD as a local calendar date. */
export function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function ageFromDob(iso: string, asOf: Date = new Date()): number | null {
  const born = parseIsoDate(iso);
  if (!born) {
    return null;
  }
  let age = asOf.getFullYear() - born.getFullYear();
  const monthDelta = asOf.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < born.getDate())) {
    age -= 1;
  }
  return age;
}

export function divisionFromDob(iso: string, asOf: Date = new Date()): SnookerDivision | null {
  const age = ageFromDob(iso, asOf);
  if (age == null) {
    return null;
  }
  if (age < 16) {
    return 'u16';
  }
  if (age < 18) {
    return 'u18';
  }
  if (age < 21) {
    return 'u21';
  }
  if (age < 40) {
    return 'open';
  }
  if (age < 50) {
    return 'masters';
  }
  return 'seniors';
}

export function divisionLabel(division: SnookerDivision | null | undefined): string {
  switch (division) {
    case 'u16':
      return 'Under 16';
    case 'u18':
      return 'Under 18';
    case 'u21':
      return 'Under 21';
    case 'open':
      return 'Open';
    case 'masters':
      return 'Masters 40+';
    case 'seniors':
      return 'Seniors 50+';
    default:
      return 'Division unset';
  }
}

const MIN_AGE = 8;
const MAX_AGE = 90;

/** Validate a calendar DOB and return YYYY-MM-DD. */
export function parseAndValidateDob(iso: string): string {
  const parsed = isoDateSchema.safeParse(iso.trim());
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Enter your date of birth as day, month, and year');
  }
  const age = ageFromDob(parsed.data);
  if (age == null || age < MIN_AGE || age > MAX_AGE) {
    throw new AppError('VALIDATION', `Age must be between ${MIN_AGE} and ${MAX_AGE}`);
  }
  return parsed.data;
}
