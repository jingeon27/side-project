import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDetailShareImage } from './DetailShareImage';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  profile: vi.fn(),
  sdk: vi.fn(),
  render: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/features/post/index.server', () => ({ getPublicPost: mocks.post }));
vi.mock('@/features/user/index.server', () => ({ getPublicServerProfile: mocks.profile }));
// 공개 캐시를 거치지 않고 SDK로 바로 읽으면 이 대역이 불린다(수정 전 동작).
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  getPost: mocks.sdk,
  getPublicProfile: mocks.sdk,
}));
vi.mock('@side/design-system/og', () => ({
  createSocialPreview: mocks.render,
  readSocialPreviewImage: vi.fn(),
}));
vi.mock('@/shared/api/server', () => ({
  publicServerOptions: () => ({ baseUrl: 'http://127.0.0.1:4301' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }));
afterEach(() => vi.resetAllMocks());

async function expectDefaultImage(response: Response) {
  expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile('public/brand/og-image.png'));
  expect(response.headers.get('cache-control')).toBe('no-store');
}

describe('상세 공유 이미지의 공개 조회', () => {
  it('게시글 카드는 상세 문서와 같은 공개 캐시 조회로 읽는다', async () => {
    mocks.post.mockResolvedValue({
      post: {
        title: '함께 연습해요',
        body: '수비 배치를 배워요',
        board: 'FREE',
        category: { name: '클래시로얄' },
        author: { nickname: '작성자' },
      },
    });
    mocks.render.mockResolvedValue(new Response());
    await createDetailShareImage('posts', 'post-1');
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('post-1');
    expect(mocks.sdk).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledOnce();
  });

  it('없는 글과 사용자는 보고하지 않고 기본 이미지로 대신한다', async () => {
    mocks.post.mockResolvedValue(null);
    mocks.profile.mockResolvedValue(null);
    await expectDefaultImage(await createDetailShareImage('posts', 'missing-post'));
    await expectDefaultImage(await createDetailShareImage('users', 'missing-user'));
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('캐시 경계를 지나 ApiError가 아니게 된 조회 오류도 보고하고 기본 이미지로 대신한다', async () => {
    const failure = new Error('An error occurred in the Server Components render.');
    mocks.post.mockRejectedValue(failure);
    await expectDefaultImage(await createDetailShareImage('posts', 'post-1'));
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(failure);
  });
});
