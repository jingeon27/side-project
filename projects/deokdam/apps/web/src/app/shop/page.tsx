import type { Metadata } from 'next';
import Link from 'next/link';

import { loginPath } from '@/features/account/navigation';
import { currentAccount } from '@/features/account/session';
import { Checkout } from '@/features/shop/Checkout';
import { portOneConfig } from '@/features/shop/portone';
import { products, productSchema, reportPrice } from '@/features/shop/products';
import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '7일 풀이' };

export default async function ShopPage({ searchParams }: PageProps<'/shop'>) {
  const params = await searchParams;
  const chosen = params.topic === 'parent' ? 'parent-week' : 'job-week';
  const selected = products[chosen];
  const checkout = portOneConfig();
  const account = await currentAccount();

  return (
    <>
      <main id="main-content" className="site-width reading-width inner-page">
        <div className="episode-heading">
          <p className="label">덕담집 7일 풀이</p>
          <h1>{selected.title}</h1>
          <p>내 사주에서 떠올린 주제와 하루 한 장의 실천을 담았어요.</p>
        </div>
        <nav className="topic-tabs" aria-label="7일 풀이 유형">
          {productSchema.options.map((id) => (
            <Link
              href={'/shop?topic=' + products[id].topic}
              aria-current={id === chosen ? 'page' : undefined}
              key={id}
            >
              {products[id].topic === 'parent' ? '부모용' : '취준생용'}
            </Link>
          ))}
        </nav>
        <section className="deok-card product-preview">
          <p className="label">첫째 날 미리 보기</p>
          <h2>{selected.cards[0].title}</h2>
          <p>{selected.cards[0].practice}</p>
        </section>
        <ol className="report-days" start={2}>
          {selected.cards.slice(1).map((step, index) => (
            <li key={step.title}>
              <strong>{index + 2}일째</strong> {step.title}
            </li>
          ))}
        </ol>
        <section className="reading-panel checkout-panel">
          <h2>복채 {reportPrice.toLocaleString('ko-KR')}원</h2>
          <p>리포트 한 편을 한 번 결제해요. 같은 계정의 구매 내역에서 일곱 장을 열 수 있어요.</p>
          {checkout ? (
            account ? (
              <Checkout account={account.id} product={chosen} key={chosen} />
            ) : (
              <Link className="action-link" href={loginPath('/shop?topic=' + selected.topic)}>
                로그인하고 결제하기
              </Link>
            )
          ) : (
            <p className="notice">결제 준비 중이에요. 첫째 날 풀이는 지금 읽을 수 있어요.</p>
          )}
          <Link className="plain-link" href="/shop/orders">
            구매 내역
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
