import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LoginButtons } from '@/features/account/AccountActions';
import { providerSchema, returnPath } from '@/features/account/navigation';
import { oauthConfig } from '@/features/account/oauth';
import { currentAccount } from '@/features/account/session';

export const metadata: Metadata = { title: '로그인', robots: { index: false, follow: false } };
const messages: Record<string, string> = {
  cancelled: '로그인을 취소했어요. 원할 때 다시 시작하세요.',
  expired: '로그인 시간이 지났어요. 아래에서 다시 시작하세요.',
  unavailable: '이 로그인 방법을 준비하고 있어요. 다른 방법을 선택해 주세요.',
  failed: '로그인을 마치지 못했어요. 같은 계정으로 다시 시도해 주세요.',
};
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = returnPath(params.next);
  if (await currentAccount()) redirect(next);
  const shop = next.startsWith('/shop');
  return (
    <main id="main-content" className="login-page">
      <section className="login-paper">
        <Image src="/images/deokdam-mark.png" alt="" width={48} height={48} />
        <h1>{shop ? '내 계정으로 7일 풀이 열기' : '내 덕 기록장 열기'}</h1>
        <p>
          {shop
            ? '로그인하면 결제한 풀이를 다른 기기에서도 다시 읽을 수 있어요.'
            : '오늘 남긴 한 줄을 모아두고, 다른 기기에서도 이어보세요.'}
        </p>
        {typeof params.error === 'string' && messages[params.error] && (
          <p className="error-text" role="alert">
            {messages[params.error]}
          </p>
        )}
        <LoginButtons next={next} enabled={providerSchema.options.filter((p) => Boolean(oauthConfig(p)))} />
        <p className="small-muted">기기마다 처음 고른 로그인 방법을 사용해 주세요.</p>
        <Link className="plain-link" href="/privacy">
          개인정보 안내
        </Link>
      </section>
    </main>
  );
}
