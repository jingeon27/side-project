import type { GameProfile } from '@game-feedback/contracts';
import { ApiError } from '../../common/http/api-error';
import type { ProfileProvider } from './profile-provider';

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
      if (response.status === 404)
        throw new ApiError(404, 'PLAYER_NOT_FOUND', '플레이어를 찾을 수 없습니다.');
      if (!response.ok) throw new Error('Upstream failed');
      const p = (await response.json()) as {
        tag: string;
        name: string;
        trophies: number;
        bestTrophies: number;
        arena?: { name: string };
        clan?: { name: string };
        currentDeck?: { id: number; name: string; level: number; iconUrls?: { medium?: string } }[];
      };
      return {
        playerTag: p.tag,
        name: p.name,
        trophies: p.trophies,
        bestTrophies: p.bestTrophies,
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
      throw new ApiError(
        503,
        'PROFILE_UNAVAILABLE',
        '게임 프로필을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }
}
