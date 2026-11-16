import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Author } from '@/shared/api';

import { UserBadges } from './UserBadges';

const author = {
  id: 'player',
  nickname: '플레이어',
  avatarUrl: null,
  isVerified: false,
  isTestAccount: false,
  supercellTag: null,
} satisfies Author;

describe('author badges without empty spacing', () => {
  it('does not leave an empty inline row when there is no badge or visible tag', () => {
    const { container, rerender } = render(<UserBadges author={author} />);
    expect(container.childElementCount).toBe(0);
    rerender(<UserBadges author={{ ...author, supercellTag: '#P0LYQ829' }} showTag={false} />);
    expect(container.childElementCount).toBe(0);
  });

  it('keeps verification and visible tags', () => {
    render(<UserBadges author={{ ...author, isVerified: true, supercellTag: '#P0LYQ829' }} />);
    expect(screen.getByText('인증 유저')).toBeTruthy();
    expect(screen.getByText('#P0LYQ829')).toBeTruthy();
  });
});
