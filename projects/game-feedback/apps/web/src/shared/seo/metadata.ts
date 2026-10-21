import type { Metadata } from 'next';
import { translate, isLocale, type TLocale } from '@/shared/i18n/index.server';
import { excerpt, getSeoConfig, pageUrl } from './config';
export const SITE_NAME = 'Game Mate';
const baseKeywords = ['게임 커뮤니티', '게임 피드백', '게임코치', SITE_NAME];
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
  locale?: TLocale;
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
  locale = 'ko',
}: IPageMetadata): Metadata {
  const { indexable, origin } = getSeoConfig();
  const allowed = indexable && !privatePage && !isTestAccount;
  const url = pageUrl(path);
  const text = excerpt(description);
  const siteName = translate(locale, SITE_NAME);
  const fullTitle = `${excerpt(title, 80)} | ${siteName}`;
  const images = [{ url: `${origin}/og`, width: 1200, height: 630, alt: siteName }];
  return {
    title: { absolute: fullTitle },
    description: text,
    keywords: [
      ...new Set([
        ...baseKeywords.map((word) => translate(locale, word)),
        ...keywords.map((word) => excerpt(word, 60)),
      ]),
    ],
    alternates: { canonical: url },
    robots: { index: allowed, follow: !privatePage, googleBot: { index: allowed, follow: !privatePage } },
    ...(authorName ? { authors: [{ name: authorName, ...(authorUrl ? { url: authorUrl } : {}) }] } : {}),
    openGraph: {
      type,
      title: fullTitle,
      description: text,
      url,
      siteName,
      locale: { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP' }[locale],
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
  search: {
    title: '게시글 검색',
    description: '제목과 내용으로 게시글을 검색하세요.',
    keywords: ['게시글 검색'],
    privatePage: true,
  },
  write: {
    title: '글쓰기',
    description: '게임 이야기와 모집 글을 작성하고 플레이어와 나누세요.',
    keywords: ['게시글 작성'],
    privatePage: true,
  },
  feed: {
    title: '게임 커뮤니티 홈',
    description: '피드백, 친추판매, 전투 모집, 게임코치의 유료 강의와 자유게시판 글을 피드에서 만나보세요.',
    keywords: [
      '게임 커뮤니티',
      '피드백',
      '친추판매',
      '전투 모집',
      '1:1',
      '팀전',
      '게임코치',
      '게임 강의',
      '자유게시판',
    ],
  },
  guide: {
    title: 'Game Mate 이용 가이드',
    description:
      '전체 게시글 검색과 다섯 분류, 전투 모집, 코치·수강생 모집, 채팅, 게임 계정 등록과 프로필 인증 방법을 안내합니다.',
    keywords: ['커뮤니티 가이드', '게임코치', '전투 모집', '채팅', '프로필 인증'],
  },
  terms: {
    title: '이용약관',
    description: 'Game Mate 비공개 알파의 서비스 이용 조건과 커뮤니티 운영 원칙을 확인하세요.',
    keywords: ['서비스 이용약관'],
  },
  privacy: {
    title: '개인정보 처리 안내',
    description: 'Game Mate의 계정, 게시글, 채팅 정보 처리와 보유 및 삭제에 관한 안내입니다.',
    keywords: ['개인정보 처리', '계정 삭제'],
  },
  contact: {
    title: '문의 및 신고 안내',
    description: 'Game Mate 서비스 문의, 제안과 커뮤니티 신고 방법을 확인하세요.',
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
    description: '내 피드백 요청에 도착한 답변, 댓글, 도움됨 알림을 확인하세요.',
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
export function staticPagePath(kind: TStaticPage, locale: string) {
  return `/${locale}${kind === 'feed' ? '' : `/${kind}`}`;
}
export function localizedStaticContent(kind: TStaticPage, locale: string) {
  const language =
    ['guide', 'terms', 'privacy', 'contact'].includes(kind) && isLocale(locale) ? locale : 'ko';
  const content = pageContent[kind];
  return {
    ...content,
    language,
    title: translate(language, content.title),
    description: translate(language, content.description),
    keywords: content.keywords.map((word) => translate(language, word)),
  };
}
export function staticPageMetadata(kind: TStaticPage, locale: string): Metadata {
  const { language, ...content } = localizedStaticContent(kind, locale);
  const metadata = createPageMetadata({ ...content, locale: language, path: staticPagePath(kind, locale) });
  if (!['guide', 'terms', 'privacy', 'contact'].includes(kind)) return metadata;
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      languages: Object.fromEntries(
        ['ko', 'en', 'ja'].map((value) => [value, pageUrl(staticPagePath(kind, value))]),
      ),
    },
  };
}
