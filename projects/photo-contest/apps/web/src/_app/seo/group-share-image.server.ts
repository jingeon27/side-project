import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { captureException } from '@sentry/nextjs';

import { createSocialPreview, readSocialPreviewImage } from '@side/design-system/og';

import { getGroupContestSeoData } from '@/_pages/group-contest/index.server';
import { getGroupSeoData } from '@/_pages/group/index.server';
import { GroupVisibility, PostKind } from '@/shared/api/generated';
import { PublicQueryError } from '@/shared/api/public-query.server';
import { getServerApiUrl } from '@/shared/api/server-request.helper';

const assets = Promise.all([
  readFile(join(process.cwd(), 'public/fonts/NotoSansKR-Social.woff')),
  readFile(join(process.cwd(), 'src/app/icon.svg')),
]);
const fallbackArtwork = readFile(join(process.cwd(), 'public/brand/og-image.png'));

export async function createGroupShareImage(groupId: string, contestId?: string) {
  const fallback = async () =>
    new Response(new Uint8Array(await fallbackArtwork), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  if (![groupId, ...(contestId ? [contestId] : [])].every((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)))
    return fallback();
  try {
    const data = contestId
      ? await getGroupContestSeoData(groupId, contestId)
      : await getGroupSeoData(groupId).then((group) => (group ? { ...group, contest: null } : null));
    if (!data || data.group.visibility !== GroupVisibility.Public) return fallback();
    const contest = data.contest;
    if (contestId && !contest) return fallback();
    const media =
      data.group.avatarUrl ||
      data.group.coverUrl ||
      data.posts.find((post) => post.kind === PostKind.Photo)?.mediaUrl;
    const image =
      media &&
      /^\/backend\/(?:groups\/[A-Za-z0-9_-]+\/(?:cover|avatar)\/[A-Za-z0-9_-]+|media\/[A-Za-z0-9_-]+)$/.test(
        media,
      )
        ? await readSocialPreviewImage(new URL(media.replace('/backend', ''), getServerApiUrl()))
        : null;
    const [font, logo] = await assets;
    return await createSocialPreview(
      {
        brand: '피식',
        variant: 'warm',
        logo: `data:image/svg+xml;base64,${logo.toString('base64')}`,
        title: contest?.title || data.group.name,
        description: contest
          ? data.group.name
          : data.group.description || '함께 나누고 싶은 사진과 동영상을 모아요.',
        label: contest ? '그룹 대회' : '공개 그룹',
        detail: contest
          ? `${data.group.name}  |  참여작 ${contest.entryCount}개`
          : `멤버 ${data.group.memberCount}명  |  우리끼리 모으면 더 피식.`,
        image,
      },
      new Uint8Array(font).buffer,
    );
  } catch (error) {
    if (!(
      error instanceof PublicQueryError &&
      ['NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code ?? '')
    ))
      captureException(error);
    return fallback();
  }
}
