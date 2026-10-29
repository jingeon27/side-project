import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Comment } from '@/shared/api';

import { CommentItem } from './CommentItem';

afterEach(() => vi.useRealTimers());
describe('댓글 시간의 서버 렌더와 하이드레이션', () => {
  it('서버와 브라우저 시간이 달라도 첫 마크업을 맞춘 뒤 상대 시간으로 바꿔야 한다', async () => {
    vi.setSystemTime(new Date('2026-10-20T01:00:00Z'));
    const comment = {
      id: 'comment',
      postId: 'post',
      parentId: null,
      replyCount: 0,
      repliesCursor: null,
      isDeleted: false,
      body: '댓글 본문',
      createdAt: '2026-10-20T00:00:00Z',
      updatedAt: '2026-10-20T00:00:00Z',
      author: { id: 'author', nickname: '친구', isVerified: false, supercellTag: null, isTestAccount: false },
    } satisfies Comment;
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = renderToString(<CommentItem comment={comment} mine={false} />);
    expect(container.textContent).toContain('2026-10-20 00:00 UTC');
    vi.setSystemTime(new Date('2026-10-20T02:00:00Z'));
    const errors = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <CommentItem comment={comment} mine={false} />, {
        onRecoverableError: errors,
      });
    });
    await waitFor(() => expect(container.querySelector('time')?.textContent).toBe('2시간 전'));
    expect(errors).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
