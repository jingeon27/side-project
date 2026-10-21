import { useEffect, useState } from 'react';

import { QueryClient, QueryClientProvider, queryOptions, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceErrorBoundary } from './ServiceErrorBoundary';

function UnstableRegion({ failed }: { failed: boolean }) {
  if (failed) throw new Error('private response must never appear in the fallback');
  return <p>복구된 영역</p>;
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

describe('ServiceErrorBoundary', () => {
  it('shows a public contact address and blocks repeated recovery while its mutation is pending without a query provider', async () => {
    const recovery = Promise.withResolvers<void>();
    const onReset = vi.fn(() => recovery.promise);
    render(
      <ServiceErrorBoundary title="대화창" onReset={onReset}>
        <UnstableRegion failed />
      </ServiceErrorBoundary>,
    );
    const contact = screen.getByRole('link', { name: 'jingeon27@gmail.com' });
    expect(contact.getAttribute('href')).toBe('mailto:jingeon27@gmail.com');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    const pending = await screen.findByRole<HTMLButtonElement>('button', { name: '다시 불러오는 중…' });
    expect(pending.disabled).toBe(true);
    fireEvent.click(pending);
    expect(onReset).toHaveBeenCalledOnce();
    recovery.reject(new Error('secret recovery payload'));
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '다시 시도하기' }).disabled).toBe(false),
    );
    expect(screen.queryByText(/secret recovery/)).toBeNull();
  });

  it('contains render failures and preserves sibling state', () => {
    const cleanup = vi.fn();
    function Sibling() {
      const [count, setCount] = useState(0);
      useEffect(() => cleanup, []);
      return <button onClick={() => setCount(count + 1)}>계속 사용 {count}</button>;
    }
    render(
      <>
        <Sibling />
        <ServiceErrorBoundary title="대화창">
          <UnstableRegion failed />
        </ServiceErrorBoundary>
      </>,
    );
    expect(screen.getByRole('alert', { name: '대화창 오류' })).toBeTruthy();
    expect(screen.queryByText(/private response/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '계속 사용 0' }));
    expect(screen.getByRole('button', { name: '계속 사용 1' })).toBeTruthy();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('retries a failed region without remounting healthy siblings', async () => {
    let failed = true;
    const siblingMount = vi.fn();
    function Region() {
      return <UnstableRegion failed={failed} />;
    }
    function Sibling() {
      useEffect(siblingMount, []);
      return <p>정상 댓글</p>;
    }
    render(
      <>
        <Sibling />
        <ServiceErrorBoundary
          title="답변"
          onReset={() => {
            failed = false;
          }}
        >
          <Region />
        </ServiceErrorBoundary>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await screen.findByText('복구된 영역');
    expect(screen.getByText('정상 댓글')).toBeTruthy();
    expect(siblingMount).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('contains a rejected asynchronous recovery and allows a later retry', async () => {
    let failed = true;
    const onReset = vi
      .fn()
      .mockRejectedValueOnce(new Error('secret recovery payload'))
      .mockImplementationOnce(() => {
        failed = false;
      });
    function Region() {
      return <UnstableRegion failed={failed} />;
    }
    render(
      <ServiceErrorBoundary title="게시글" onReset={onReset}>
        <Region />
      </ServiceErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '다시 시도하기' }).disabled).toBe(false),
    );
    expect(screen.getByRole('alert', { name: '게시글 오류' })).toBeTruthy();
    expect(screen.queryByText(/secret recovery/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await screen.findByText('복구된 영역');
    expect(onReset).toHaveBeenCalledTimes(2);
  });

  it('keeps retry available when rendering continues to fail', async () => {
    const onReset = vi.fn();
    render(
      <ServiceErrorBoundary title="대화창" onReset={onReset}>
        <UnstableRegion failed />
      </ServiceErrorBoundary>,
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
      await waitFor(() =>
        expect(screen.getByRole<HTMLButtonElement>('button', { name: '다시 시도하기' }).disabled).toBe(false),
      );
    }
    expect(screen.getByRole('alert', { name: '대화창 오류' })).toBeTruthy();
    expect(onReset).toHaveBeenCalledTimes(2);
  });

  it('clears failed state when the account or conversation identity changes', () => {
    const { rerender } = render(
      <ServiceErrorBoundary title="대화창" resetKey="user-a:chat-a">
        <UnstableRegion failed />
      </ServiceErrorBoundary>,
    );
    rerender(
      <ServiceErrorBoundary title="대화창" resetKey="user-b:chat-b">
        <UnstableRegion failed={false} />
      </ServiceErrorBoundary>,
    );
    expect(screen.getByText('복구된 영역')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resets TanStack query errors so a failed query can fetch again', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const request = vi.fn().mockRejectedValueOnce(new Error('failed request')).mockResolvedValue('새 대화');
    const options = queryOptions({ queryKey: ['boundary-recovery'], queryFn: request, throwOnError: true });
    function Region() {
      const { data } = useQuery(options);
      return <p>{data ?? '불러오는 중'}</p>;
    }
    render(
      <QueryClientProvider client={client}>
        <ServiceErrorBoundary title="대화창">
          <Region />
        </ServiceErrorBoundary>
      </QueryClientProvider>,
    );
    await screen.findByRole('alert', { name: '대화창 오류' });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await screen.findByText('새 대화');
    expect(request).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
