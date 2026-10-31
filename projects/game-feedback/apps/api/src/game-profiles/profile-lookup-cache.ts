import dayjs from 'dayjs';

import type { GameProfile } from '@game-feedback/contracts';

interface IEntry {
  expiresAt: number;
  profile: Promise<GameProfile>;
}

/**
 * Supercell lookups spend the server's API token and can take seconds, so a preview followed by saving
 * the same tag, or several users checking one tag, share one upstream call for a short time. Failures
 * are not cached. The process-local map is bounded and only holds public profile data.
 */
export class ProfileLookupCache {
  private readonly entries = new Map<string, IEntry>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 500,
  ) {}

  get(playerTag: string, load: () => Promise<GameProfile>, now = dayjs().valueOf()): Promise<GameProfile> {
    const cached = this.entries.get(playerTag);
    if (cached && cached.expiresAt > now) return cached.profile;
    const entry = { expiresAt: now + this.ttlMs, profile: load() };
    this.entries.delete(playerTag);
    this.entries.set(playerTag, entry);
    entry.profile.catch(() => {
      if (this.entries.get(playerTag) === entry) this.entries.delete(playerTag);
    });
    this.evict(now);
    return entry.profile;
  }

  private evict(now: number) {
    for (const [tag, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries && entry.expiresAt > now) return;
      this.entries.delete(tag);
    }
  }
}
