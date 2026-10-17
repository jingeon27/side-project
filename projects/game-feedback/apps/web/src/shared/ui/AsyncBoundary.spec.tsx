import { useEffect } from 'react';
import Link from 'next/link';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncBoundary } from './AsyncBoundary';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
describe('AsyncBoundary', () => {
  it('defers browser-only cookie queries on the server while preserving seeded SSR content', () => {
    const client = new QueryClient();
    const request = vi.fn(async () => 'private messages');
    const options = queryOptions({ queryKey: ['browser-only'], queryFn: request });
    function Region() {
      const { data } = useSuspenseQuery(options);
      return <p>{data}</p>;
    }
    const html = renderToString(
      <QueryClientProvider client={client}>
        <AsyncBoundary title="대화창" clientOnly pendingFallback={<p>메시지 준비 중</p>}>
          <Region />
        </AsyncBoundary>
        <AsyncBoundary title="게시글">
          <p>서버 게시글 원문</p>
        </AsyncBoundary>
      </QueryClientProvider>,
    );
    expect(request).not.toHaveBeenCalled();
    expect(html).toContain('메시지 준비 중');
    expect(html).toContain('서버 게시글 원문');
    expect(html).not.toContain('private messages');
    client.clear();
  });
  it('shows a pending region and then its data without remounting a healthy sibling', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const response = Promise.withResolvers<string>();
    const options = queryOptions({ queryKey: ['async-pending'], queryFn: () => response.promise });
    const mounted = vi.fn();
    function Sibling() {
      useEffect(mounted, []);
      return <input aria-label="초안" defaultValue="남겨 둔 내용" />;
    }
    function Region() {
      const { data } = useSuspenseQuery(options);
      return <p>{data}</p>;
    }
    render(
      <QueryClientProvider client={client}>
        <Sibling />
        <AsyncBoundary title="대화 목록" pendingFallback={<p>목록 준비 중</p>}>
          <Region />
        </AsyncBoundary>
      </QueryClientProvider>,
    );
    expect(screen.getByText('목록 준비 중')).toBeTruthy();
    response.resolve('새 대화 목록');
    await screen.findByText('새 대화 목록');
    expect(mounted).toHaveBeenCalledOnce();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '초안' }).value).toBe('남겨 둔 내용');
    client.clear();
  });
  it('contains a suspense query rejection and refetches only that region on retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('private server payload'))
      .mockResolvedValue('복구한 대화');
    const options = queryOptions({ queryKey: ['async-recovery'], queryFn: request });
    function Region() {
      const { data } = useSuspenseQuery(options);
      return <p>{data}</p>;
    }
    render(
      <QueryClientProvider client={client}>
        <AsyncBoundary title="대화창" recoveryAction={<Link href="/ko/messages">목록으로</Link>}>
          <Region />
        </AsyncBoundary>
      </QueryClientProvider>,
    );
    await screen.findByRole('alert', { name: '대화창 오류' });
    expect(screen.queryByText(/private server/)).toBeNull();
    expect(screen.getByRole('link', { name: '목록으로' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await screen.findByText('복구한 대화');
    expect(request).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
