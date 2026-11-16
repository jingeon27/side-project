import dayjs from 'dayjs';

import type { GameProfile } from '@game-feedback/contracts';

import type { ProfileProvider } from './profile-provider';

export class DemoProfileProvider implements ProfileProvider {
  async lookup(playerTag: string): Promise<GameProfile> {
    return {
      playerTag,
      name: playerTag === '#9QY82JGY' ? '덱연구소' : '새벽의호그',
      trophies: 6850,
      bestTrophies: 7023,
      currentGlobalRank: 1234,
      bestGlobalRank: 358,
      arena: '고요의 성역',
      clan: '로얄메이트',
      deck: [
        '호그 라이더',
        '머스킷병',
        '얼음 골렘',
        '대포',
        '파이어 볼',
        '통나무',
        '해골 병사',
        '얼음 정령',
      ].map((name, index) => ({ id: 26000000 + index, name, level: 14, iconUrl: null })),
      verification: 'UNVERIFIED',
      source: 'DEMO',
      fetchedAt: dayjs().toISOString(),
    };
  }
}
