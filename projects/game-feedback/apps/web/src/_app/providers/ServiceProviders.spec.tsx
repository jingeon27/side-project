import type { ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sessionOptions } from '@/features/auth';
import { categoryOptions } from '@/features/category';
import { useI18n } from '@/shared/i18n';
import { useThemePreference } from '@/shared/theme';

import { ServiceProviders } from './ServiceProviders';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/en',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('./NativeBridge', () => ({ NativeBridge: () => null }));
vi.mock('./NativePushSync', () => ({ NativePushSync: () => null }));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  getSession: async () => ({
    user: null,
    demoMode: false,
    googleConfigured: false,
    needsOnboarding: false,
  }),
}));

type TContext = ComponentProps<typeof ServiceProviders>['context'];

function createContext(): TContext {
  return {
    initialSession: { user: null, demoMode: false, googleConfigured: false, needsOnboarding: false },
    initialCategories: [],
    theme: 'dark',
    language: 'en',
    automaticLocale: 'en',
    navigation: false,
  };
}

function Probe({ name }: { name: string }) {
  const client = useQueryClient();
  const categories = useQuery({ ...categoryOptions(), enabled: false });
  const theme = useThemePreference();
  const { locale, preference } = useI18n();
  return (
    <section aria-label={name}>
      <output>{`${theme}|${locale}|${preference}|${client.getQueryData(sessionOptions().queryKey)?.demoMode}|${categories.data?.length}|${categories.data?.[0]?.slug ?? 'empty'}`}</output>
      <button
        type="button"
        onClick={() =>
          client.setQueryData(categoryOptions().queryKey, [{ id: name, slug: name, name, active: true }])
        }
      >
        초안 저장
      </button>
    </section>
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'gamefeedback_theme=; Path=/; Max-Age=0';
  document.cookie = 'gamefeedback_language=; Path=/; Max-Age=0';
});

it('서버 렌더는 전달한 테마·언어 스냅샷과 세션·분류 초기 캐시를 그대로 사용해야 한다', () => {
  const html = renderToString(
    <ServiceProviders locale="en" context={createContext()}>
      <Probe name="server" />
    </ServiceProviders>,
  );
  expect(html).toContain('dark|en|en|false|0|empty');
});

it('서로 다른 Provider 인스턴스는 QueryClient와 초안을 공유하지 않아야 한다', async () => {
  render(
    <>
      <ServiceProviders locale="en" context={createContext()}>
        <Probe name="first" />
      </ServiceProviders>
      <ServiceProviders locale="en" context={createContext()}>
        <Probe name="second" />
      </ServiceProviders>
    </>,
  );
  fireEvent.click(
    within(screen.getByRole('region', { name: 'first' })).getByRole('button', { name: '초안 저장' }),
  );
  expect(await within(screen.getByRole('region', { name: 'first' })).findByText(/\|first$/)).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'second' })).getByText(/\|empty$/)).toBeTruthy();
});

it('부모가 새 서버 컨텍스트 객체로 다시 렌더해도 이미 만든 QueryClient와 초안은 유지해야 한다', async () => {
  const view = render(
    <ServiceProviders locale="en" context={createContext()}>
      <Probe name="kept" />
    </ServiceProviders>,
  );
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
  expect(await screen.findByText(/\|kept$/)).toBeTruthy();
  view.rerender(
    <ServiceProviders locale="en" context={{ ...createContext(), navigation: true }}>
      <Probe name="kept" />
    </ServiceProviders>,
  );
  expect(screen.getByText(/\|kept$/)).toBeTruthy();
});
