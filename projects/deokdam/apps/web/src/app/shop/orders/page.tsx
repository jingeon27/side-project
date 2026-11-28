import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { z } from 'zod';

import { loginPath } from '@/features/account/navigation';
import { currentAccount } from '@/features/account/session';
import { legacyOrderCookie } from '@/features/shop/http';
import { orderIdSchema } from '@/features/shop/order-contract';
import { OrderHistory } from '@/features/shop/OrderHistory';
import { portOneConfig } from '@/features/shop/portone';
import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '구매 내역', robots: { index: false, follow: false } };

export default async function OrdersPage({ searchParams }: PageProps<'/shop/orders'>) {
  const params = await searchParams;
  const redirected = orderIdSchema.safeParse(params.paymentId);
  const account = await currentAccount();
  if (!account)
    redirect(loginPath('/shop/orders' + (redirected.success ? '?paymentId=' + redirected.data : '')));
  const legacy = z.uuid().safeParse((await cookies()).get(legacyOrderCookie)?.value);
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
          account={account.id}
          legacy={legacy.success && Boolean(portOneConfig())}
          redirectedId={redirected.success ? redirected.data : undefined}
          support={portOneConfig()?.email}
        />
      </main>
      <SiteFooter />
    </>
  );
}
