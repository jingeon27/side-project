import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TLoginFailure } from '@game-feedback/contracts';

import { LanguageProvider, type TLocale } from '@/shared/i18n';

import { LoginPage } from './LoginPage';

const state = vi.hoisted(() => ({ trackLoginFailure: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: null, needsOnboarding: false, googleConfigured: true } }),
}));
vi.mock('@/widgets/authentication', () => ({ SocialLoginForm: () => null, LoginLegalLinks: () => null }));
vi.mock('@/shared/analytics', () => ({ trackLoginFailure: state.trackLoginFailure }));
afterEach(() => state.trackLoginFailure.mockReset());

function renderLogin(failure: TLoginFailure | null, locale: TLocale = 'ko') {
  return render(
    <LanguageProvider initialLocale={locale} initialPreference="auto" automaticLocale={locale}>
      <LoginPage locale={locale} returnTo={`/${locale}`} failure={failure} />
    </LanguageProvider>,
  );
}

// 소셜 로그인 콜백 실패가 로그인 화면으로 돌아와도 이유를 읽지 않아 아무 안내 없이 버튼만 보였다.
describe('소셜 로그인 실패 안내', () => {
  it.each([
    ['expired', '로그인 요청이 만료됐어요. 다시 시도해 주세요.'],
    ['failed', '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'],
    ['banned', '이용이 제한된 소셜 계정으로는 다시 가입할 수 없어요.'],
    ['cancelled', '로그인이 취소됐어요. 다시 선택해주세요.'],
  ] satisfies Array<[TLoginFailure, string]>)('%s 이유를 화면에 알린다', (failure, message) => {
    renderLogin(failure);
    expect(screen.getByRole('alert').textContent).toBe(message);
  });

  it('영어 화면에서는 번역한 안내를 보인다', () => {
    renderLogin('expired', 'en');
    expect(screen.getByRole('alert').textContent).toBe('Your sign-in request expired. Please try again.');
  });

  it('이유가 없으면 안내하지 않는다', () => {
    renderLogin(null);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(state.trackLoginFailure).not.toHaveBeenCalled();
  });

  it('로그인 화면으로 돌아온 실패만 이유와 함께 집계하고 취소는 세지 않는다', () => {
    const view = renderLogin('banned');
    expect(state.trackLoginFailure).toHaveBeenCalledExactlyOnceWith('banned');
    view.unmount();
    renderLogin('cancelled');
    expect(state.trackLoginFailure).toHaveBeenCalledOnce();
  });
});
