import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { captureException } from '@sentry/nextjs';

import { richTextMediaReferences } from '@game-feedback/contracts';
import { createSocialPreview, readSocialPreviewImage } from '@side/design-system/og';

import { getPublicPost } from '@/features/post/index.server';
import { getPublicServerProfile } from '@/features/user/index.server';
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
    const { baseUrl } = publicServerOptions();
    // 게시글은 상세 문서와 같은 공개 캐시를 읽는다. 없는 글·사용자는 null이라 기본 이미지로 대신한다.
    const data = await (async () => {
      if (kind === 'users') {
        const profile = await getPublicServerProfile(id);
        if (!profile) return null;
        return {
          title: profile.author.nickname,
          description: profile.bio || profileDescription(profile),
          label: '플레이어 프로필',
          detail: `공개 글 ${profile.postCount}개  |  공개 답변 ${profile.answerCount}개  |  도움됨 ${profile.helpfulCount}개`,
          media: profile.author.avatarUrl,
        };
      }
      const post = (await getPublicPost(id))?.post;
      if (!post) return null;
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
    if (!data) return fallback();
    const media = data.media ? URL.parse(data.media, baseUrl) : null;
    const image =
      media &&
      media.origin === new URL(baseUrl).origin &&
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
    // 없는 대상은 위에서 null로 끝나므로 여기 오는 오류(429·5xx·연결 실패)는 모두 보고한다.
    captureException(error);
    return fallback();
  }
}
