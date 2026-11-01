import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_THEME_PREFERENCE,
  describeAppearance,
  preferenceFromSaved,
  resolveThemeId,
} from '@/theme/theme-preference';

const nothingSaved = { mode: null, darkThemeId: null, legacyThemeId: null };

describe('resolveThemeId', () => {
  it('stays light in light mode even when the phone is dark', () => {
    expect(resolveThemeId({ mode: 'light', darkThemeId: 'navy' }, 'dark')).toBe('daylight');
  });

  it('uses the chosen dark style in dark mode', () => {
    expect(resolveThemeId({ mode: 'dark', darkThemeId: 'felt' }, 'light')).toBe('felt');
  });

  it('follows the phone in system mode', () => {
    const pref = { mode: 'system', darkThemeId: 'navy' } as const;
    expect(resolveThemeId(pref, 'dark')).toBe('navy');
    expect(resolveThemeId(pref, 'light')).toBe('daylight');
  });

  it('falls back to light when the phone does not say', () => {
    const pref = { mode: 'system', darkThemeId: 'navy' } as const;
    expect(resolveThemeId(pref, null)).toBe('daylight');
    expect(resolveThemeId(pref, 'unspecified')).toBe('daylight');
  });
});

describe('preferenceFromSaved', () => {
  it('defaults to light for someone who never chose', () => {
    expect(preferenceFromSaved(nothingSaved)).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(DEFAULT_THEME_PREFERENCE.mode).toBe('light');
  });

  it('keeps an old dark choice as dark mode with the same style', () => {
    expect(preferenceFromSaved({ ...nothingSaved, legacyThemeId: 'navy' })).toEqual({
      mode: 'dark',
      darkThemeId: 'navy',
    });
  });

  it('maps the old light theme to light mode', () => {
    expect(preferenceFromSaved({ ...nothingSaved, legacyThemeId: 'daylight' }).mode).toBe('light');
  });

  it('prefers the new saved values over the old one', () => {
    expect(
      preferenceFromSaved({ mode: 'system', darkThemeId: 'felt', legacyThemeId: 'navy' }),
    ).toEqual({ mode: 'system', darkThemeId: 'felt' });
  });

  it('ignores unknown saved values', () => {
    expect(
      preferenceFromSaved({ mode: 'sepia', darkThemeId: 'daylight', legacyThemeId: 'gold' }),
    ).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(
      preferenceFromSaved({ mode: 'dark', darkThemeId: 'daylight', legacyThemeId: null }),
    ).toEqual({ mode: 'dark', darkThemeId: 'charcoal' });
  });
});

describe('describeAppearance', () => {
  it('names the dark style only when it can be in use', () => {
    expect(describeAppearance({ mode: 'light', darkThemeId: 'navy' })).toBe('Light');
    expect(describeAppearance({ mode: 'dark', darkThemeId: 'navy' })).toBe('Dark (Midnight Navy)');
  });
});
