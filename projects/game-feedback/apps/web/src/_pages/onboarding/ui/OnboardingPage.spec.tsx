import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider, sessionOptions } from '@/features/auth';
import { AuthOnboarding } from '@/widgets/authentication';
import { appRoutes } from '@game-feedback/bridge';
import type { Session } from '@/shared/api';
import { OnboardingPage } from './OnboardingPage';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/ko/onboarding',
  useSearchParams: () => new URLSearchParams({ returnTo: '/ko/notifications' }),
}));

const pendingSession: Session = {
  user: null,
  demoMode: false,
  googleConfigured: true,
  needsOnboarding: true,
};
const completedSession: Session = {
  ...pendingSession,
  user: {
    id: 'new-member',
    nickname: '새플레이어',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
    role: 'USER',
    createdAt: '2026-10-22T00:00:00.000Z',
    verifiedAt: null,
  },
  needsOnboarding: false,
};
const returnTo = '/ko/notifications';
const clients: QueryClient[] = [];
const request = vi.fn<typeof fetch>();
let respondToOnboarding: () => Promise<Response>;
let respondToSession: () => Promise<Response>;

function renderPage(initialSession: Session = pendingSession) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(sessionOptions().queryKey, initialSession);
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <SessionProvider onLogin={() => undefined}>
          <OnboardingPage locale="ko" returnTo={returnTo} />
          <AuthOnboarding />
        </SessionProvider>
      </Suspense>
    </QueryClientProvider>,
  );
  return client;
}

async function renderReadyPage() {
  const client = renderPage();
  await screen.findByRole('button', { name: '가입 완료하기' });
  return client;
}

function acceptRequiredItems() {
  fireEvent.click(screen.getByRole('checkbox', { name: /이용약관/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: '만 14세 이상입니다.' }));
}

beforeEach(() => {
  navigation.replace.mockReset();
  request.mockReset();
  respondToOnboarding = async () => Response.json(completedSession);
  respondToSession = async () => Response.json(pendingSession);
  request.mockImplementation(async (url) => {
    if (url === '/api/session') return respondToSession();
    if (url === '/api/auth/onboard') return respondToOnboarding();
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  vi.stubGlobal('fetch', request);
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

describe('회원가입 페이지', () => {
  it('캐시는 익명이어도 현재 쿠키가 가입 대기 상태라면 재조회가 끝날 때까지 로그인 이동을 보류해야 한다', async () => {
    let finishSession: (response: Response) => void = () => undefined;
    const response = new Promise<Response>((resolve) => {
      finishSession = resolve;
    });
    respondToSession = () => response;
    const client = renderPage({ ...pendingSession, needsOnboarding: false });
    expect(screen.queryByRole('textbox', { name: '서비스 닉네임' })).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
    finishSession(Response.json(pendingSession));
    expect(await screen.findByRole('textbox', { name: '서비스 닉네임' })).toBeTruthy();
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(pendingSession);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['가입 완료', completedSession, returnTo],
    ['인증 만료', { ...pendingSession, needsOnboarding: false }, appRoutes.login('ko', returnTo)],
  ] as const)(
    '서버가 %s 상태라면 오래된 가입 대기 캐시 대신 재조회 결과에 따라 이동해야 한다',
    async (_label, session, destination) => {
      respondToSession = async () => Response.json(session);
      renderPage();
      await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(destination));
      expect(screen.queryByRole('textbox', { name: '서비스 닉네임' })).toBeNull();
    },
  );

  it('세션 재조회가 진행되어도 입력한 닉네임과 필수 동의 초안을 보존해야 한다', async () => {
    const client = await renderReadyPage();
    fireEvent.change(screen.getByLabelText('서비스 닉네임'), { target: { value: '보존할닉네임' } });
    acceptRequiredItems();
    let finishSession: (response: Response) => void = () => undefined;
    const response = new Promise<Response>((resolve) => {
      finishSession = resolve;
    });
    respondToSession = () => response;
    const refreshed = client.invalidateQueries({ queryKey: sessionOptions().queryKey });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '서비스 닉네임' })).toBeNull());
    finishSession(Response.json(pendingSession));
    await refreshed;
    expect((await screen.findByRole<HTMLInputElement>('textbox', { name: '서비스 닉네임' })).value).toBe(
      '보존할닉네임',
    );
    expect(screen.getByRole('checkbox', { name: /이용약관/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: '만 14세 이상입니다.' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('별도 화면에서 닉네임과 필수 동의를 받고 두 동의가 모두 있어야 제출할 수 있어야 한다', async () => {
    await renderReadyPage();
    expect(screen.getByRole('heading', { name: '회원가입', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: '이용약관' }).getAttribute('href')).toBe('/ko/terms');
    expect(screen.getByRole('link', { name: '개인정보 처리방침' }).getAttribute('href')).toBe('/ko/privacy');
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: '가입 완료하기' });
    fireEvent.change(screen.getByLabelText('서비스 닉네임'), { target: { value: '새플레이어' } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '만 14세 이상입니다.' }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    expect(submit.disabled).toBe(true);
    expect(request.mock.calls.some(([url]) => url === '/api/auth/onboard')).toBe(false);
  });

  it.each([
    ['a', '2~20자로 입력해 주세요'],
    ['플레이어💥', '닉네임에는 문자, 숫자, 공백과 _ . -만 사용할 수 있어요.'],
  ])(
    '유효하지 않은 닉네임 %s은 입력에 오류를 연결하고 가입 요청을 보내지 않아야 한다',
    async (nickname, message) => {
      await renderReadyPage();
      const input = screen.getByLabelText('서비스 닉네임');
      fireEvent.change(input, { target: { value: nickname } });
      acceptRequiredItems();
      fireEvent.click(screen.getByRole('button', { name: '가입 완료하기' }));
      expect((await screen.findByRole('alert')).textContent).toBe(message);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
      expect(request.mock.calls.some(([url]) => url === '/api/auth/onboard')).toBe(false);
    },
  );

  it('요청 중 중복 입력을 막고 실패 초안을 보존하며 재시도 성공 뒤 원래 화면으로 돌아가야 한다', async () => {
    let finishRequest: (response: Response) => void = () => undefined;
    const response = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    respondToOnboarding = () => response;
    const client = await renderReadyPage();
    const input = screen.getByLabelText<HTMLInputElement>('서비스 닉네임');
    const terms = screen.getByRole('checkbox', { name: /이용약관/ });
    const age = screen.getByRole('checkbox', { name: '만 14세 이상입니다.' });
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: '가입 완료하기' });
    fireEvent.change(input, { target: { value: '새플레이어' } });
    acceptRequiredItems();
    fireEvent.click(submit);
    await waitFor(() => expect(submit.getAttribute('aria-busy')).toBe('true'));
    expect(input.disabled).toBe(true);
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(terms.getAttribute('aria-disabled')).toBe('true');
    expect(age.getAttribute('aria-disabled')).toBe('true');
    finishRequest(Response.json({ errorCode: 'NICKNAME_TAKEN', message: 'duplicate' }, { status: 409 }));
    expect((await screen.findByRole('alert')).textContent).toBe('이미 사용 중인 닉네임이에요.');
    expect(input.value).toBe('새플레이어');
    expect(terms.getAttribute('aria-checked')).toBe('true');
    expect(age.getAttribute('aria-checked')).toBe('true');
    expect(input.disabled).toBe(false);
    expect(submit.disabled).toBe(false);
    expect(navigation.replace).not.toHaveBeenCalled();

    respondToOnboarding = async () => Response.json(completedSession);
    fireEvent.click(submit);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(returnTo));
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(completedSession);
    const submitted = request.mock.calls.filter(([url]) => url === '/api/auth/onboard');
    expect(submitted).toHaveLength(2);
    for (const [, options] of submitted)
      expect(JSON.parse(String(options?.body))).toEqual({
        nickname: '새플레이어',
        acceptedTerms: true,
        ageConfirmed: true,
      });
  });

  it('가입 도중 인증이 만료되면 오래된 가입 대기 상태를 지우고 원래 목적지를 유지해 로그인으로 이동해야 한다', async () => {
    respondToOnboarding = async () =>
      Response.json({ errorCode: 'AUTH_REQUIRED', message: '로그인 후 이용할 수 있어요.' }, { status: 401 });
    const client = await renderReadyPage();
    fireEvent.change(screen.getByLabelText('서비스 닉네임'), { target: { value: '새플레이어' } });
    acceptRequiredItems();
    fireEvent.click(screen.getByRole('button', { name: '가입 완료하기' }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(appRoutes.login('ko', returnTo)));
    expect(client.getQueryData(sessionOptions().queryKey)).toMatchObject({
      user: null,
      needsOnboarding: false,
    });
    expect(screen.queryByRole('textbox', { name: '서비스 닉네임' })).toBeNull();
  });
});
