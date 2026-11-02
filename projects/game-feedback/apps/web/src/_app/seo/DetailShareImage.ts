import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { captureException } from '@sentry/nextjs';

import { richTextMediaReferences } from '@game-feedback/contracts';
import { ApiError, getPost, getPublicProfile } from '@game-feedback/sdk';
import { createSocialPreview, readSocialPreviewImage } from '@side/design-system/og';

import { publicServerOptions } from '@/shared/api/server';
import { profileDescription } from '@/shared/seo';

import { createShareImage } from './ShareImage';

const assets = Promise.all([
  readFile(join(process.cwd(), 'public/fonts/NotoSansKR-Social.woff')),
  readFile(join(process.cwd(), 'src/app/icon.svg')),
]);
const labels = {
  FEEDBACK: '플레이 피드백',
  FRIEND_SALE: '친추 판매',
  FRIENDLY: '전투 모집',
  COACHING: '게임 코칭',
  FREE: '자유게시판',
};

export async function createDetailShareImage(kind: string, id: string) {
  const fallback = async () => {
    const response = await createShareImage();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (!['posts', 'users'].includes(kind) || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return fallback();
  try {
    const options = publicServerOptions();
    const data = await (async () => {
      if (kind === 'users') {
        const profile = await getPublicProfile(id, options);
        return {
          title: profile.author.nickname,
          description: profile.bio || profileDescription(profile),
          label: '플레이어 프로필',
          detail: `공개 글 ${profile.postCount}개  |  공개 답변 ${profile.answerCount}개  |  도움됨 ${profile.helpfulCount}개`,
          media: profile.author.avatarUrl,
        };
      }
      const { post } = await getPost(id, options);
      const price = post.friendSale?.price;
      return {
        title: post.title,
        description: post.body,
        label: `${post.category.name}  /  ${labels[post.board ?? 'FEEDBACK']}`,
        detail: `${post.author.nickname}${post.friendSale ? `  |  ${price ? `${price.toLocaleString('ko-KR')}원` : '가격 협의'}` : ''}`,
        media:
          richTextMediaReferences(post.document).find((item) => item.kind === 'IMAGE')?.url ||
          post.author.avatarUrl,
      };
    })();
    const media = data.media ? URL.parse(data.media, options.baseUrl) : null;
    const image =
      media &&
      media.origin === new URL(options.baseUrl).origin &&
      /^\/api\/(?:users\/[A-Za-z0-9_-]{1,100}\/avatar|post-media\/[A-Za-z0-9_-]{1,100})$/.test(
        media.pathname,
      ) &&
      /^(?:\?v=[A-Za-z0-9_-]{1,100})?$/.test(media.search)
        ? await readSocialPreviewImage(media)
        : null;
    const [font, logo] = await assets;
    return await createSocialPreview(
      {
        ...data,
        brand: 'Game Mate',
        variant: 'forest',
        logo: `data:image/svg+xml;base64,${logo.toString('base64')}`,
        image,
      },
      new Uint8Array(font).buffer,
    );
  } catch (error) {
    if (!(error instanceof ApiError && [403, 404].includes(error.status))) captureException(error);
    return fallback();
  }
}
