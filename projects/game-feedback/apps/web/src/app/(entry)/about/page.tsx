import { LandingPage } from '@/_pages/landing';
import { createPageMetadata, JsonLd, pageUrl } from '@/shared/seo';

export const metadata = createPageMetadata({
  title: '플레이를 나누고 함께할 사람을 만나요',
  description:
    '게임 플레이에 대한 피드백을 주고받고, 함께 연습할 상대와 코치를 찾아보세요. 사진과 동영상, 댓글과 1:1 채팅으로 이야기를 이어가는 Game Mate입니다.',
  path: '/about',
  keywords: ['Game Mate 소개', '게임 피드백', '전투 모집', '게임코치'],
});

export { rootViewport as viewport } from '@/_app/index.server';

export default function Page() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Game Mate 소개',
          url: pageUrl('/about'),
          inLanguage: 'ko-KR',
        }}
      />
      <LandingPage />
    </>
  );
}
