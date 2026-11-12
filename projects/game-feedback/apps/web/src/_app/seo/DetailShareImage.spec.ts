import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDetailShareImage } from './DetailShareImage';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  profile: vi.fn(),
  render: vi.fn(),
  image: vi.fn(),
  options: vi.fn(),
}));
vi.mock('@/features/post/index.server', () => ({ getPublicPost: mocks.post }));
vi.mock('@/features/user/index.server', () => ({ getPublicServerProfile: mocks.profile }));
vi.mock('@side/design-system/og', () => ({
  createSocialPreview: mocks.render,
  readSocialPreviewImage: mocks.image,
}));
vi.mock('@/shared/api/server', () => ({ publicServerOptions: mocks.options }));
afterEach(() => vi.resetAllMocks());

describe('public detail image reads', () => {
  it('uses the public post lookup and actual post title and author', async () => {
    mocks.options.mockReturnValue({ baseUrl: 'http://127.0.0.1:4301' });
    mocks.post.mockResolvedValue({
      post: {
        title: '함께 연습해요',
        body: '수비 배치를 배워요',
        board: 'COACHING',
        category: { name: '클래시로얄' },
        author: { nickname: '코치' },
      },
    });
    mocks.render.mockResolvedValue(new Response());
    await createDetailShareImage('posts', 'post-1');
    expect(mocks.post).toHaveBeenCalledWith('post-1');
    expect(mocks.render.mock.calls[0]?.[0]).toMatchObject({
      title: '함께 연습해요',
      label: '클래시로얄  /  게임 코칭',
      detail: '코치',
    });
  });
  it('rejects arbitrary paths before fetching or generating personalized content', async () => {
    const response = await createDetailShareImage('posts', '../secret');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile('public/brand/og-image.png'));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('keeps the versioned public avatar URL when rendering a profile', async () => {
    mocks.options.mockReturnValue({ baseUrl: 'http://127.0.0.1:4301' });
    mocks.profile.mockResolvedValue({
      author: { nickname: '플레이어', avatarUrl: '/api/users/user-1/avatar?v=avatar-1' },
      bio: '함께 플레이해요',
      postCount: 1,
      answerCount: 2,
      helpfulCount: 0,
    });
    mocks.image.mockResolvedValue('data:image/png;base64,AQID');
    mocks.render.mockResolvedValue(new Response());
    await createDetailShareImage('users', 'user-1');
    expect(mocks.profile).toHaveBeenCalledWith('user-1');
    expect(String(mocks.image.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:4301/api/users/user-1/avatar?v=avatar-1',
    );
    expect(mocks.render.mock.calls[0]?.[0]).toMatchObject({ image: 'data:image/png;base64,AQID' });
  });
  it('does not fetch arbitrary avatar URLs supplied in API data', async () => {
    mocks.options.mockReturnValue({ baseUrl: 'http://127.0.0.1:4301' });
    mocks.profile.mockResolvedValue({
      author: { nickname: '플레이어', avatarUrl: 'http://127.0.0.1/private' },
      bio: '함께 플레이해요',
      postCount: 1,
      answerCount: 2,
      helpfulCount: 0,
    });
    mocks.render.mockResolvedValue(new Response());
    await createDetailShareImage('users', 'user-1');
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.render.mock.calls[0]?.[0]).toMatchObject({ title: '플레이어', image: null });
  });
});
