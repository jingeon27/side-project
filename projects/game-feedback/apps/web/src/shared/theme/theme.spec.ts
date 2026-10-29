import { describe, expect, it } from 'vitest';

import { themePreference } from './theme';

describe('theme preference', () => {
  it('allows explicit light and dark modes and resumes the system for missing or invalid cookies', () => {
    expect(themePreference('light')).toBe('light');
    expect(themePreference('dark')).toBe('dark');
    for (const value of ['system', 'invalid', '<script>', '', undefined, null, 1])
      expect(themePreference(value)).toBe('system');
  });
});
