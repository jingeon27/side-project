import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Notification } from '@/shared/api';
import { LanguageProvider } from '@/shared/i18n';

import { NotificationItem } from './NotificationItem';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const notification = {
  id: 'notification-1',
  type: 'COMMENT_REPLY',
  postId: 'post-1',
  answerId: null,
  commentId: 'comment-1',
  actor: {
    id: 'actor',
    nickname: '답글작성자',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
  },
  postTitle: '수정된 게시글 제목',
  readAt: null,
  createdAt: '2026-10-22T00:00:00.000Z',
} satisfies Notification;

function renderItem(value: Notification, locale: 'ko' | 'en' = 'ko') {
  return render(
    <LanguageProvider initialLocale={locale} initialPreference={locale} automaticLocale={locale}>
      <NotificationItem notification={value} href="/ko/posts/post-1" onRead={() => undefined} />
    </LanguageProvider>,
  );
}

describe('notification copy', () => {
  it('composes the sentence from the current actor and post title in the screen language', () => {
    const korean = renderItem(notification);
    expect(screen.getByText('답글작성자님이 "수정된 게시글 제목"에 답글을 남겼어요.')).toBeTruthy();
    korean.unmount();
    renderItem({ ...notification, type: 'FOLLOWED_POST' }, 'en');
    expect(screen.getByText('New post from 답글작성자: 수정된 게시글 제목')).toBeTruthy();
  });

  it('names a missing actor without exposing an identifier', () => {
    renderItem({ ...notification, type: 'HELPFUL', actor: null });
    expect(
      screen.getByText('알 수 없는 플레이어님이 "수정된 게시글 제목"의 피드백을 도움됨으로 표시했어요.'),
    ).toBeTruthy();
  });
});
