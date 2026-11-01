import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appRoutes } from '@game-feedback/bridge';

import { BoardComposeEntry } from './BoardComposeEntry';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  prefetch: vi.fn(),
  requireLogin: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, prefetch: navigation.prefetch }),
}));
vi.mock('@/features/auth', () => ({ useSession: navigation.useSession }));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.useSession.mockReturnValue({
    session: { user: { id: 'player' } },
    requireLogin: navigation.requireLogin,
  });
});

describe('board compose entry', () => {
  it('opens the existing login gate before attempting to compose anonymously', () => {
    navigation.useSession.mockReturnValue({
      session: { user: null },
      requireLogin: navigation.requireLogin,
    });
    render(<BoardComposeEntry locale="ko" board="FEEDBACK" />);
    fireEvent.click(screen.getByRole('button', { name: '글쓰기' }));
    expect(navigation.requireLogin).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.prefetch).not.toHaveBeenCalled();
  });

  it.each([
    ['ko', 'FRIENDLY', 'battleMode=TEAM', { battleMode: 'TEAM' }],
    ['en', 'COACHING', 'coachingRole=STUDENT', { coachingRole: 'STUDENT' }],
    ['ja', 'FREE', '', {}],
  ] as const)(
    'preserves %s locale, %s board, game and current recruitment filters',
    (locale, board, query, filters) => {
      window.history.replaceState({}, '', `/${locale}/boards/test?game=brawl-stars&${query}`);
      render(<BoardComposeEntry locale={locale} board={board} />);
      fireEvent.click(screen.getByRole('button', { name: '글쓰기' }));
      expect(navigation.push).toHaveBeenCalledWith(appRoutes.compose(locale, board, 'brawl-stars', filters));
      expect(navigation.prefetch).toHaveBeenCalledWith(
        appRoutes.compose(locale, board, 'brawl-stars', filters),
      );
      expect(navigation.requireLogin).not.toHaveBeenCalled();
    },
  );
});
