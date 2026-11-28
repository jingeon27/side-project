import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LoginButtons } from '@/features/account/AccountActions';
import { localLoginEnabled, localTestAccounts } from '@/features/account/local-login';
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
            : '내가 만든 덕담, 받은 풀이, 해본 일을 다른 기기에서도 이어보세요.'}
        </p>
        {typeof params.error === 'string' && messages[params.error] && (
          <p className="error-text" role="alert">
            {messages[params.error]}
          </p>
        )}
        <LoginButtons next={next} enabled={providerSchema.options.filter((p) => Boolean(oauthConfig(p)))} />
        <p className="small-muted">
          이 브라우저에서 로그인 전에 남긴 기록은 지금 선택한 계정에 담겨요. 다른 기기에서도 같은 로그인
          방법을 골라주세요.
        </p>
        <Link className="plain-link" href="/privacy">
          개인정보 안내
        </Link>
        {localLoginEnabled(await headers()) && (
          <section className="local-login-panel" aria-label="로컬 테스트 로그인">
            <h2>로컬 테스트 로그인</h2>
            <div>
              {localTestAccounts.map((key) => (
                <form key={key} action="/api/auth/local-login" method="post">
                  <input type="hidden" name="next" value={next} />
                  <button type="submit" name="account" value={key}>
                    테스트 계정 {key}로 로그인
                  </button>
                </form>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
