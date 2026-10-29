import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { GameProfile } from '@/shared/api';

import { ProfileSnapshot } from './ProfileSnapshot';

const profile: GameProfile = {
  playerTag: '#QLLLPR89G',
  name: '초보',
  arena: 'Musketeer Street',
  clan: null,
  trophies: 11102,
  bestTrophies: 12000,
  deck: [],
  verification: 'UNVERIFIED',
  source: 'SUPERCELL',
  fetchedAt: '2026-10-26T00:00:00.000Z',
};

afterEach(cleanup);

describe('게임 계정 카드', () => {
  it('트로피와 현재·최고 시즌 순위를 별도 항목으로 표시하고 RoyaleAPI 프로필을 연결한다', () => {
    render(<ProfileSnapshot profile={{ ...profile, currentGlobalRank: 1234, bestGlobalRank: 358 }} />);
    expect(screen.getByText('11,102')).toBeTruthy();
    expect(screen.getByText('1,234위')).toBeTruthy();
    expect(screen.getByText('358위')).toBeTruthy();
    const link = screen.getByRole('link', { name: '초보의 RoyaleAPI 프로필 (새 탭)' });
    expect(link.getAttribute('href')).toBe('https://royaleapi.com/player/QLLLPR89G');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('이전 버전으로 저장한 프로필에는 순위가 없다는 사실을 표시한다', () => {
    render(<ProfileSnapshot profile={profile} />);
    expect(screen.getAllByText('정보 없음')).toHaveLength(2);
  });
});
