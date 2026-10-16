import type { Metadata } from 'next';
import { excerpt, getSeoConfig, pageUrl } from './config';
export const SITE_NAME = '플레이메이트';
const baseKeywords = ['클래시 로얄', '클래시로얄', '게임 피드백', '덱 상담', SITE_NAME];
interface IPageMetadata {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
  privatePage?: boolean;
  type?: 'website' | 'article' | 'profile';
  publishedTime?: string;
  modifiedTime?: string;
  authorName?: string;
  authorUrl?: string;
  isTestAccount?: boolean;
}
export function createPageMetadata({
  title,
  description,
  path,
  keywords = [],
  privatePage,
  type = 'website',
  publishedTime,
  modifiedTime,
  authorName,
  authorUrl,
  isTestAccount,
}: IPageMetadata): Metadata {
  const { indexable, origin } = getSeoConfig();
  const allowed = indexable && !privatePage && !isTestAccount;
  const url = pageUrl(path);
  const text = excerpt(description);
  const fullTitle = `${excerpt(title, 80)} · ${SITE_NAME}`;
  const images = [{ url: `${origin}/og`, width: 1200, height: 630, alt: 'Game Feedback · 플레이메이트' }];
  return {
    title: excerpt(title, 80),
    description: text,
    keywords: [...new Set([...baseKeywords, ...keywords.map((word) => excerpt(word, 60))])],
    alternates: { canonical: url },
    robots: { index: allowed, follow: !privatePage, googleBot: { index: allowed, follow: !privatePage } },
    ...(authorName ? { authors: [{ name: authorName, ...(authorUrl ? { url: authorUrl } : {}) }] } : {}),
    openGraph: {
      type,
      title: fullTitle,
      description: text,
      url,
      siteName: SITE_NAME,
      locale: 'ko_KR',
      images,
      ...(type === 'profile' && authorName ? { username: authorName } : {}),
      ...(type === 'article'
        ? { publishedTime, modifiedTime, authors: authorUrl ? [authorUrl] : undefined }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: text,
      images: images.map((image) => image.url),
    },
  };
}
export const pageContent = {
  feed: {
    title: '클래시 로얄 피드백 라운지',
    description: '클래시 로얄 덱과 플레이 고민을 나누고 다른 플레이어의 구체적인 피드백을 받아보세요.',
    keywords: ['덱 추천', '플레이 상담', '피드백 요청'],
  },
  guide: {
    title: '피드백 요청 가이드',
    description: '덱과 게임 상황을 공유하고 구체적인 피드백을 주고받는 방법을 알아보세요.',
    keywords: ['피드백 작성법', '커뮤니티 가이드'],
  },
  terms: {
    title: '이용약관',
    description: '플레이메이트 비공개 알파의 서비스 이용 조건과 커뮤니티 운영 원칙을 확인하세요.',
    keywords: ['서비스 이용약관'],
  },
  privacy: {
    title: '개인정보 처리 안내',
    description: '플레이메이트의 계정·게시글·채팅 정보 처리와 보유·삭제에 관한 안내입니다.',
    keywords: ['개인정보 처리', '계정 삭제'],
  },
  contact: {
    title: '문의 및 신고 안내',
    description: '플레이메이트 서비스 문의, 제안과 커뮤니티 신고 방법을 확인하세요.',
    keywords: ['서비스 문의', '커뮤니티 신고'],
  },
  messages: {
    title: '내 채팅',
    description: '플레이어와 나눈 비공개 1:1 대화를 확인하고 이어가세요.',
    keywords: ['1:1 채팅'],
    privatePage: true,
  },
  notifications: {
    title: '내 알림',
    description: '내 피드백 요청에 도착한 답변·댓글·도움됨 알림을 확인하세요.',
    keywords: ['피드백 알림'],
    privatePage: true,
  },
  settings: {
    title: '내 프로필 설정',
    description: '내 계정, 연결된 게임 프로필과 차단한 사용자를 관리하세요.',
    keywords: ['계정 설정', '게임 프로필 연결'],
    privatePage: true,
  },
} as const;
export type TStaticPage = keyof typeof pageContent;
export function staticPageMetadata(kind: TStaticPage, locale: string): Metadata {
  return createPageMetadata({ ...pageContent[kind], path: `/${locale}${kind === 'feed' ? '' : `/${kind}`}` });
}
