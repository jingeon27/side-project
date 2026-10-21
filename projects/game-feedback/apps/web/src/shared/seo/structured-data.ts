import { translate } from '@/shared/i18n/index.server';
import type { PostDetail, PublicProfile } from '@/shared/api';
import { pageUrl, excerpt } from './config';
import { pageContent, localizedStaticContent, SITE_NAME, staticPagePath, type TStaticPage } from './metadata';
const publicPageTypes = {
  feed: 'WebPage',
  guide: 'WebPage',
  terms: 'WebPage',
  privacy: 'WebPage',
  contact: 'ContactPage',
} as const satisfies Partial<Record<TStaticPage, string>>;
export type TPublicStaticPage = keyof typeof publicPageTypes;
export function publicPageStructuredData(kind: TPublicStaticPage, locale: string) {
  const homeUrl = pageUrl('/');
  const url = pageUrl(staticPagePath(kind, locale));
  const content = localizedStaticContent(kind, locale);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${homeUrl}#website`,
        url: homeUrl,
        name: SITE_NAME,
        description: pageContent.feed.description,
        inLanguage: 'ko',
      },
      {
        '@type': publicPageTypes[kind],
        '@id': `${url}#webpage`,
        url,
        name: `${content.title} | ${translate(content.language, SITE_NAME)}`,
        description: content.description,
        inLanguage: content.language,
        isPartOf: { '@id': `${homeUrl}#website` },
      },
    ],
  };
}
function person(author: { id: string; nickname: string }) {
  return {
    '@type': 'Person',
    '@id': `${pageUrl(`/ko/users/${encodeURIComponent(author.id)}`)}#person`,
    name: author.nickname,
    url: pageUrl(`/ko/users/${encodeURIComponent(author.id)}`),
  };
}
export function postStructuredData(detail: PostDetail) {
  const { post, answers, comments } = detail;
  const activeComments = comments.filter((comment) => !comment.isDeleted);
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': `${pageUrl(`/ko/posts/${encodeURIComponent(post.id)}`)}#discussion`,
    url: pageUrl(`/ko/posts/${encodeURIComponent(post.id)}`),
    mainEntityOfPage: pageUrl(`/ko/posts/${encodeURIComponent(post.id)}`),
    headline: post.title,
    text: post.body,
    author: person(post.author),
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    commentCount: answers.length + activeComments.length,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/ViewAction',
      userInteractionCount: post.viewCount,
    },
    comment: [...answers, ...activeComments].slice(0, 50).map((item) => ({
      '@type': 'Comment',
      text: item.body,
      datePublished: item.createdAt,
      dateModified: item.updatedAt,
      author: person(item.author),
    })),
  };
}
export function profileDescription(profile: PublicProfile) {
  return `${profile.author.nickname}님의 플레이어 프로필. 공개 게시글 ${profile.postCount}개, 답변 ${profile.answerCount}개, 도움됨 ${profile.helpfulCount}개를 확인하세요.`;
}
export function profileStructuredData(profile: PublicProfile, cursor?: string) {
  const url = pageUrl(
    `/ko/users/${encodeURIComponent(profile.author.id)}${cursor !== undefined ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': url,
    url,
    name: `${profile.author.nickname} 플레이어 프로필 | ${SITE_NAME}`,
    description: excerpt(profileDescription(profile)),
    inLanguage: 'ko',
    dateCreated: profile.joinedAt,
    mainEntity: {
      ...person(profile.author),
      identifier: profile.author.id,
      description: excerpt(profileDescription(profile)),
      agentInteractionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/WriteAction',
        userInteractionCount: profile.postCount + profile.answerCount,
      },
    },
  };
}
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
