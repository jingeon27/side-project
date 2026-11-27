'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Button } from '@side/design-system/ui/button';

import type { TOrder } from './order-contract';
import { readOrders, updateOrder } from './orders-client';
import { products } from './products';

const statusLabels = {
  pending: '결제 확인 대기',
  issued: '리포트 열람 가능',
  refund_requested: '환불 접수',
  refunded: '환불 완료',
} satisfies Record<TOrder['status'], string>;

export function OrderHistory({ redirectedId, support }: { redirectedId?: string; support?: string }) {
  const [orders, setOrders] = useState<TOrder[]>();
  const [feedback, setFeedback] = useState('');
  const [active, setActive] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const list = await readOrders(controller.signal);
        const target = list.find((order) => order.id === redirectedId && order.status === 'pending');
        if (!target) {
          setOrders(list);
          return;
        }
        try {
          const verified = await updateOrder(target.id, 'verify', controller.signal);
          setOrders(list.map((order) => (order.id === verified.id ? verified : order)));
        } catch {
          if (controller.signal.aborted) return;
          setOrders(list);
          setFeedback('결제 확인을 마치지 못했어요. 주문의 결제 확인을 다시 눌러주세요.');
        }
      } catch {
        if (!controller.signal.aborted) setFeedback('구매 내역을 불러오지 못했어요.');
      }
    }
    void load();
    return () => controller.abort();
  }, [loadAttempt, redirectedId]);

  const handleOrder = async (order: TOrder, action: 'verify' | 'refund') => {
    setActive(order.id);
    setFeedback('');
    try {
      const result = await updateOrder(order.id, action);
      setOrders((current) => current?.map((item) => (item.id === result.id ? result : item)));
      if (result.status === 'pending') setFeedback('아직 승인된 결제가 확인되지 않았어요.');
      if (action === 'refund') setFeedback('환불 요청을 접수했어요.');
    } catch {
      setFeedback('처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setActive('');
    }
  };

  return (
    <>
      {feedback && (
        <p className="notice" role="status">
          {feedback}
        </p>
      )}
      {!orders &&
        (feedback ? (
          <Button
            onClick={() => {
              setFeedback('');
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            다시 불러오기
          </Button>
        ) : (
          <p role="status">구매 내역을 확인하고 있어요.</p>
        ))}
      {orders?.length === 0 && (
        <section className="empty-state">
          <h2>이 브라우저에 구매한 풀이가 없어요</h2>
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
                onClick={() => handleOrder(order, 'verify')}
              >
                결제 상태 확인
              </Button>
            )}
            {order.status === 'issued' && (
              <Button variant="ghost" disabled={Boolean(active)} onClick={() => handleOrder(order, 'refund')}>
                환불 요청
              </Button>
            )}
          </div>
        </section>
      ))}
      {support && (
        <p className="small-muted">
          다른 브라우저에서 결제했거나 구매 내역 확인이 필요하면 결제 영수증 번호와 함께{' '}
          <a href={'mailto:' + support}>{support}</a>로 문의해 주세요.
        </p>
      )}
    </>
  );
}
