import type { Metadata } from 'next';
import Link from 'next/link';

import { orderIdSchema } from '@/features/shop/order-contract';
import { OrderHistory } from '@/features/shop/OrderHistory';
import { portOneConfig } from '@/features/shop/portone';
import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '구매 내역', robots: { index: false, follow: false } };

export default async function OrdersPage({ searchParams }: PageProps<'/shop/orders'>) {
  const params = await searchParams;
  const redirected = orderIdSchema.safeParse(params.paymentId);
  return (
    <>
      <main id="main-content" className="site-width reading-width inner-page">
        <Link className="back-link" href="/shop">
          7일 풀이로 돌아가기
        </Link>
        <div className="episode-heading">
          <h1>구매 내역</h1>
        </div>
        <OrderHistory
          redirectedId={redirected.success ? redirected.data : undefined}
          support={portOneConfig()?.email}
        />
      </main>
      <SiteFooter />
    </>
  );
}
