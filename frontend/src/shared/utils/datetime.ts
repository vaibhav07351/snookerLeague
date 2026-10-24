/** Subtle local date + time for history rows, e.g. "19 Sep · 1:42 pm". */
export function formatDateTimeSubtle(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

/**
 * Friendly "last match day" for home.
 * e.g. "Today", "Yesterday", "Sat 19 Sep", "No matches yet".
 */
export function formatLastMatchDay(iso: string | null): string {
  if (!iso) {
    return 'No matches yet';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return 'No matches yet';
  }

  const startOfDay = (x: Date): number => {
    const n = new Date(x);
    n.setHours(0, 0, 0, 0);
    return n.getTime();
  };

  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Format seconds as m:ss or h:mm:ss. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Compact avg label for stats tiles, e.g. "12m", "45s", "1h 4m". */
export function formatDurationCompact(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) {
    return '—';
  }
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) {
    return `${s}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return sec > 0 || m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}
