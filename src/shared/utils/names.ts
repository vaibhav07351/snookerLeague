export interface NamedId {
  id: string;
  name: string;
}

function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

function firstName(name: string): string {
  return words(name)[0] ?? name.trim();
}

function surname(name: string): string | null {
  const parts = words(name);
  return parts.length > 1 ? (parts[parts.length - 1] ?? null) : null;
}

/**
 * Compact names for tight surfaces (live scoreboard). Everyone gets their first name,
 * unless two people share a first name: then those players show their surname instead.
 * If the surnames also clash (or are missing), the full name is used so nobody is ambiguous.
 */
export function shortNames(people: NamedId[]): Record<string, string> {
  const byFirst = new Map<string, NamedId[]>();
  for (const p of people) {
    const key = firstName(p.name).toLocaleLowerCase();
    byFirst.set(key, [...(byFirst.get(key) ?? []), p]);
  }

  const out: Record<string, string> = {};
  for (const group of byFirst.values()) {
    if (group.length === 1) {
      const only = group[0]!;
      out[only.id] = firstName(only.name) || only.name;
      continue;
    }
    const surnameCounts = new Map<string, number>();
    for (const p of group) {
      const s = surname(p.name)?.toLocaleLowerCase();
      if (s) {
        surnameCounts.set(s, (surnameCounts.get(s) ?? 0) + 1);
      }
    }
    for (const p of group) {
      const s = surname(p.name);
      const unique = s != null && surnameCounts.get(s.toLocaleLowerCase()) === 1;
      out[p.id] = unique ? s : p.name.trim();
    }
  }
  return out;
}

/** "A & B" for a doubles side, or the single name. */
export function joinSide(ids: string[], nameOf: (id: string) => string): string {
  if (ids.length === 0) {
    return '-';
  }
  return ids.map(nameOf).join(' & ');
}
