import { describe, expect, it, vi } from 'vitest';

import type { GameProfile } from '@game-feedback/contracts';

import { ProfileLookupCache } from './profile-lookup-cache';

const profile = (playerTag: string) => ({ playerTag, name: 'player' }) as GameProfile;

describe('short-lived Supercell profile lookup cache', () => {
  it('shares one upstream call for the same tag until the entry expires', async () => {
    const cache = new ProfileLookupCache(60_000);
    const load = vi.fn(async () => profile('#P0LYQ829'));
    const [first, concurrent] = await Promise.all([
      cache.get('#P0LYQ829', load, 0),
      cache.get('#P0LYQ829', load, 10),
    ]);
    expect(concurrent).toBe(first);
    await cache.get('#P0LYQ829', load, 59_999);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get('#P0LYQ829', load, 60_000);
    expect(load).toHaveBeenCalledTimes(2);
    await cache.get('#GG829JGY', load, 60_000);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('does not keep failed lookups', async () => {
    const cache = new ProfileLookupCache();
    const failing = vi.fn(async () => {
      throw new Error('upstream unavailable');
    });
    await expect(cache.get('#P0LYQ829', failing, 0)).rejects.toThrow('upstream unavailable');
    const load = vi.fn(async () => profile('#P0LYQ829'));
    await expect(cache.get('#P0LYQ829', load, 1)).resolves.toMatchObject({ playerTag: '#P0LYQ829' });
    expect(load).toHaveBeenCalledOnce();
  });
  it('keeps only the newest entries within its bound', async () => {
    const cache = new ProfileLookupCache(60_000, 2);
    const load = vi.fn(async () => profile('#TAG'));
    for (const tag of ['#A', '#B', '#C']) await cache.get(tag, load, 0);
    await cache.get('#C', load, 1);
    await cache.get('#B', load, 1);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get('#A', load, 1);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
