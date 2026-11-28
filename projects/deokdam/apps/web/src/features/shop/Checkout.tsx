'use client';

import { useRouter } from 'next/navigation';

import { useForm } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { loginPath } from '@/features/account/navigation';
import { reportFocus } from '@/features/reading/local-reading';
import { analyticsDeviceId, track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import { requestCheckout, updateOrder } from './orders-client';
import { products, reportPrice, type TProduct } from './products';

export function Checkout({ product, account }: { product: TProduct; account: string }) {
  const form = useForm({ defaultValues: { adult: false } });
  const router = useRouter();
  const handleCheckout = async ({ adult }: { adult: boolean }) => {
    track(event.CheckoutClicked, { product });
    try {
      const created = await requestCheckout(account, {
        product,
        adult,
        element: reportFocus(products[product].topic),
        deviceId: analyticsDeviceId(),
      });
      if (!created.checkout) {
        router.push('/shop/orders');
        return;
      }
      const { requestPayment } = await import('@portone/browser-sdk/v2');
      const payment = await requestPayment({ ...created.checkout, currency: 'KRW', payMethod: 'CARD' });
      if (payment?.code) {
        toast.info('결제창이 닫혔거나 결제가 완료되지 않았어요. 구매 내역에서 확인할 수 있어요.');
        return;
      }
      if (payment) {
        try {
          await updateOrder(account, created.order.id, 'verify');
        } catch {
          // The order remains available for verification after a redirect or retry.
        }
        router.push('/shop/orders');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'login_required') {
        window.location.assign(loginPath('/shop?topic=' + products[product].topic));
        return;
      }
      toast.error('결제창을 열지 못했어요. 이미 결제했다면 구매 내역을 확인해 주세요.');
    }
  };

  return (
    <form className="checkout-form" onSubmit={form.handleSubmit(handleCheckout)}>
      <label className="choice">
        <input
          type="checkbox"
          required
          {...form.register('adult', {
            onChange: (change) => {
              if (change.target.checked) track(event.ReportOffered, { product });
            },
          })}
        />
        만 19세 이상이며 7일 풀이를 한 번 구매해요.
      </label>
      <Button type="submit" loading={form.formState.isSubmitting}>
        {reportPrice.toLocaleString('ko-KR')}원 결제하기
      </Button>
    </form>
  );
}
