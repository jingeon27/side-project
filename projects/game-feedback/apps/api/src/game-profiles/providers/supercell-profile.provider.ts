import type { GameProfile } from '@game-feedback/contracts';

import { ApiError } from '../../common/http/api-error';
import type { ProfileProvider } from './profile-provider';
import { ProfileException } from './profile.exception';

function globalRank(result?: { rank?: number | null } | null) {
  const rank = result?.rank;
  return typeof rank === 'number' && Number.isSafeInteger(rank) && rank > 0 ? rank : null;
}

export class SupercellProfileProvider implements ProfileProvider {
  constructor(private readonly apiToken: string) {}
  async lookup(playerTag: string): Promise<GameProfile> {
    try {
      const response = await fetch(
        `https://api.clashroyale.com/v1/players/${encodeURIComponent(playerTag)}`,
        {
          headers: { Authorization: `Bearer ${this.apiToken}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.status === 404) throw ProfileException.playerNotFound();
      if (!response.ok) throw new Error('Upstream failed');
      const p = (await response.json()) as {
        tag: string;
        name: string;
        trophies: number;
        bestTrophies: number;
        currentPathOfLegendSeasonResult?: { rank?: number | null } | null;
        bestPathOfLegendSeasonResult?: { rank?: number | null } | null;
        arena?: { name: string };
        clan?: { name: string };
        currentDeck?: { id: number; name: string; level: number; iconUrls?: { medium?: string } }[];
      };
      return {
        playerTag: p.tag,
        name: p.name,
        trophies: p.trophies,
        bestTrophies: p.bestTrophies,
        currentGlobalRank: globalRank(p.currentPathOfLegendSeasonResult),
        bestGlobalRank: globalRank(p.bestPathOfLegendSeasonResult),
        arena: p.arena?.name ?? '',
        clan: p.clan?.name ?? null,
        deck: (p.currentDeck ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          iconUrl: c.iconUrls?.medium ?? null,
        })),
        verification: 'UNVERIFIED',
        source: 'SUPERCELL',
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ProfileException.unavailable();
    }
  }
}
