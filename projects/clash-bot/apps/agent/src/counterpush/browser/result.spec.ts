import { describe, expect, it } from 'vitest';

import { parseBrowserResult } from './browser.ts';

describe('Counterpush result', () => {
  it('uses visible crown totals and rejects malformed or out-of-range labels', () => {
    expect(parseBrowserResult('Crowns: you 0, the opponent 3')).toMatchObject({
      blue: 0,
      red: 3,
      outcome: 'loss',
    });
    expect(parseBrowserResult('Crowns: you 2, the opponent 1')?.outcome).toBe('win');
    expect(parseBrowserResult('Crowns: you 0, the opponent 0')?.outcome).toBe('draw');
    expect(parseBrowserResult('Crowns: you 0, the opponent 2, overtime')?.outcome).toBe('loss');
    expect(parseBrowserResult('Crowns: you 2, the opponent 2, still playing')).toBeNull();
    expect(parseBrowserResult('Crowns: you 4, the opponent 0')).toBeNull();
    expect(parseBrowserResult('You won')).toBeNull();
  });
});
