import type { PostDetail, PublicProfile } from '@/shared/api';
import { pageUrl, excerpt } from './config';
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
    commentCount: answers.length + comments.length,
    comment: [...answers, ...comments].slice(0, 50).map((item) => ({
      '@type': 'Comment',
      text: item.body,
      datePublished: item.createdAt,
      dateModified: item.updatedAt,
      author: person(item.author),
    })),
  };
}
export function profileDescription(profile: PublicProfile) {
  return `${profile.author.nickname}님의 클래시 로얄 플레이어 프로필. 공개 피드백 요청 ${profile.postCount}개, 답변 ${profile.answerCount}개, 도움됨 ${profile.helpfulCount}개를 확인하세요.`;
}
export function profileStructuredData(profile: PublicProfile) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': pageUrl(`/ko/users/${encodeURIComponent(profile.author.id)}`),
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
