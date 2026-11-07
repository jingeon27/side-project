import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SubmissionCard } from './SubmissionCard';
import { SubmissionCardActions } from './SubmissionCardActions';
import { SubmissionCardBody } from './SubmissionCardBody';
import { SubmissionCardCaption } from './SubmissionCardCaption';
import { SubmissionCardPhoto } from './SubmissionCardPhoto';

const submission = {
  caption: '고양이 하품',
  imageUrl: '/backend/photos/photo-1',
  hidden: false,
  author: { __typename: 'User' as const, id: 'author', nickname: '친구', avatar: null },
};

describe('사진 카드 부품 조합', () => {
  it('캡션을 카드 이름으로 연결하고 넣은 순서대로 사진·캡션·행동을 그려야 한다', () => {
    render(
      <SubmissionCard submission={submission}>
        <SubmissionCardPhoto isPriority />
        <SubmissionCardBody>
          <SubmissionCardCaption viewerId="author" />
          <SubmissionCardActions>
            <button type="button">좋아요</button>
          </SubmissionCardActions>
        </SubmissionCardBody>
      </SubmissionCard>,
    );
    const card = screen.getByRole('article', { name: '고양이 하품' });
    expect(within(card).getByRole('img', { name: '고양이 하품' })).toHaveAttribute('loading', 'eager');
    expect(within(card).getByText('친구 (내 사진)')).toBeVisible();
    expect(within(card).getByRole('button', { name: '좋아요' })).toBeVisible();
    expect(card).not.toHaveAttribute('data-hidden');
    expect(card).not.toHaveAttribute('data-winner');
  });

  it('숨긴 사진과 우승작 표시는 카드가 소유하고 다른 사람의 사진에는 내 사진 표시를 붙이지 않아야 한다', () => {
    render(
      <SubmissionCard submission={{ ...submission, hidden: true }} isWinner>
        <SubmissionCardPhoto />
        <SubmissionCardBody>
          <SubmissionCardCaption viewerId="viewer" />
        </SubmissionCardBody>
      </SubmissionCard>,
    );
    const card = screen.getByRole('article', { name: '고양이 하품' });
    expect(card).toHaveAttribute('data-hidden', 'true');
    expect(card).toHaveAttribute('data-winner', 'true');
    expect(within(card).getByText('숨겨진 사진')).toBeVisible();
    expect(within(card).getByRole('img', { name: '고양이 하품' })).toHaveAttribute('loading', 'lazy');
    expect(within(card).getByText('친구')).toBeVisible();
  });

  it('카드 밖에서 부품을 쓰면 바로 알려야 한다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<SubmissionCardCaption viewerId="viewer" />)).toThrow('SubmissionCard is required.');
  });
});
