'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';

import { reportFocus } from '@/features/reading/local-reading';
import { analyticsDeviceId, track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import { requestCheckout, updateOrder } from './orders-client';
import { products, reportPrice, type TProduct } from './products';

export function Checkout({ product }: { product: TProduct }) {
  const [message, setMessage] = useState('');
  const form = useForm({ defaultValues: { adult: false } });
  const router = useRouter();
  const adult = useWatch({ control: form.control, name: 'adult' });
  const shown = useRef(false);
  useEffect(() => {
    if (!adult || shown.current) return;
    shown.current = true;
    track(event.ReportOffered, { product });
  }, [adult, product]);

  const handleCheckout = async ({ adult }: { adult: boolean }) => {
    setMessage('');
    track(event.CheckoutClicked, { product });
    try {
      const created = await requestCheckout({
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
        setMessage('결제창이 닫혔거나 결제가 완료되지 않았어요. 구매 내역에서 확인할 수 있어요.');
        return;
      }
      if (payment) {
        try {
          await updateOrder(created.order.id, 'verify');
        } catch {
          // The order remains available for verification after a redirect or retry.
        }
        router.push('/shop/orders');
      }
    } catch {
      setMessage('결제창을 열지 못했어요. 이미 결제했다면 구매 내역을 확인해 주세요.');
    }
  };

  return (
    <form className="checkout-form" onSubmit={form.handleSubmit(handleCheckout)}>
      <label className="choice">
        <input type="checkbox" required {...form.register('adult')} />만 19세 이상이며 7일 풀이를 한 번
        구매해요.
      </label>
      <Button type="submit" loading={form.formState.isSubmitting}>
        {reportPrice.toLocaleString('ko-KR')}원 결제하기
      </Button>
      {message && (
        <p role="alert" className="small-muted">
          {message}
        </p>
      )}
    </form>
  );
}
