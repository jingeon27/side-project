'use client';

import Link from 'next/link';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { loginPath } from '@/features/account/navigation';

import type { TOrder } from './order-contract';
import { readOrders, updateOrder } from './orders-client';
import { products } from './products';

const statusLabels = {
  pending: '결제 확인 대기',
  issued: '리포트 열람 가능',
  refund_requested: '환불 접수',
  refunded: '환불 완료',
} satisfies Record<TOrder['status'], string>;

export function OrderHistory({
  account,
  redirectedId,
  support,
  legacy,
}: {
  account: string;
  redirectedId?: string;
  support?: string;
  legacy: boolean;
}) {
  const cache = useQueryClient();
  const key = ['orders', account, redirectedId];
  const list = useQuery({
    queryKey: key,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const orders = await readOrders(account, signal);
      const target = orders.find((order) => order.id === redirectedId && order.status === 'pending');
      if (!target) return orders;
      try {
        const updated = await updateOrder(account, target.id, 'verify', signal);
        return orders.map((order) => (order.id === updated.id ? updated : order));
      } catch {
        if (!signal.aborted) toast.error('결제 확인을 마치지 못했어요. 주문에서 다시 확인해 주세요.');
        return orders;
      }
    },
  });
  const update = useMutation({
    mutationFn: ({ order, action }: { order: TOrder; action: 'verify' | 'refund' }) =>
      updateOrder(account, order.id, action),
    onSuccess: (order, { action }) => {
      cache.setQueryData<TOrder[]>(key, (items) =>
        items?.map((item) => (item.id === order.id ? order : item)),
      );
      if (action === 'refund') toast.success('환불 요청을 접수했어요.');
      if (order.status === 'pending') toast.info('아직 승인된 결제가 확인되지 않았어요.');
    },
    onError: (error) => {
      if (error.message === 'login_required') {
        window.location.assign(loginPath('/shop/orders'));
        return;
      }
      toast.error('처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    },
  });
  const orders = list.data;
  const active = update.isPending ? update.variables.order.id : undefined;
  return (
    <>
      {legacy && (
        <form action="/api/orders/claim" method="post">
          <button className="plain-link">이 기기에서 예전에 결제한 주문 가져오기</button>
        </form>
      )}
      {list.isError &&
        (list.error.message === 'login_required' ? (
          <a href={loginPath('/shop/orders')}>다시 로그인</a>
        ) : (
          <Button onClick={() => list.refetch()}>구매 내역 다시 불러오기</Button>
        ))}
      {list.isPending && <p role="status">구매 내역을 확인하고 있어요.</p>}
      {orders?.length === 0 && (
        <section className="empty-state">
          <h2>이 계정에서 구매한 풀이가 없어요</h2>
          <Link className="action-link" href="/shop">
            7일 풀이 둘러보기
          </Link>
        </section>
      )}
      {orders?.map((order) => (
        <section key={order.id} className="reading-panel order-panel">
          <p className="label">{statusLabels[order.status]}</p>
          <h2>{products[order.product].title}</h2>
          <p className="small-muted">주문 번호 {order.id}</p>
          {order.report && (
            <>
              <p>{order.report.intro}</p>
              <ol className="report-days">
                {order.report.cards.map((card, index) => (
                  <li key={card.title}>
                    <strong>
                      {index + 1}일째 {card.title}
                    </strong>
                    <p>{card.practice}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
          <div className="order-actions">
            {order.status !== 'refunded' && (
              <Button
                variant="secondary"
                loading={active === order.id}
                disabled={Boolean(active) && active !== order.id}
                onClick={() => update.mutate({ order, action: 'verify' })}
              >
                결제 상태 확인
              </Button>
            )}
            {order.status === 'issued' && (
              <Button
                variant="ghost"
                disabled={Boolean(active)}
                onClick={() => update.mutate({ order, action: 'refund' })}
              >
                환불 요청
              </Button>
            )}
          </div>
        </section>
      ))}
      {support && (
        <p className="small-muted">
          구매 내역 확인이 필요하면 결제 영수증 번호와 함께 <a href={'mailto:' + support}>{support}</a>로
          문의해 주세요.
        </p>
      )}
    </>
  );
}
