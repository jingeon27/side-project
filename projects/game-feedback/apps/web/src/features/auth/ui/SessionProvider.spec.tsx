import { memo, Suspense } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@/shared/api';

import { sessionOptions } from '../model/auth.options';
import { SessionProvider, useSession } from './SessionProvider';

const session: Session = { user: null, demoMode: false, googleConfigured: true, needsOnboarding: false };
vi.mock('../api/auth.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSession: async () => session,
}));

const renders = { count: 0 };
const SessionConsumer = memo(function SessionConsumer() {
  const context = useSession();
  renders.count += 1;
  return <output aria-label="세션 값">{Object.keys(context).sort().join(',')}</output>;
});

describe('session context', () => {
  it('keeps the same context value when the provider re-renders with the same session', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(sessionOptions().queryKey, session);
    const onLogin = vi.fn();
    const tree = (label: string) => (
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <SessionProvider onLogin={onLogin}>
            <p>{label}</p>
            <SessionConsumer />
          </SessionProvider>
        </Suspense>
      </QueryClientProvider>
    );
    const { rerender } = render(tree('첫 렌더'));
    expect((await screen.findByRole('status', { name: '세션 값' })).textContent).toBe(
      'login,requireLogin,session',
    );
    const before = renders.count;
    rerender(tree('부모가 다시 렌더'));
    await screen.findByText('부모가 다시 렌더');
    expect(renders.count).toBe(before);
  });
});
