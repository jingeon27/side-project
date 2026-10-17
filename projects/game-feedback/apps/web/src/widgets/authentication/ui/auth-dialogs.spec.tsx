import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginDialog } from './LoginDialog';
import { OnboardingDialog } from './OnboardingDialog';

const auth = vi.hoisted(() => ({
  session: { demoMode: false, googleConfigured: true, needsOnboarding: false },
  demo: { mutate: vi.fn(), isPending: false, error: null },
  onboarding: { mutate: vi.fn(), isPending: false, error: null },
  native: { mutate: vi.fn(), isPending: false, error: null },
  useDemoLogin: vi.fn(),
  useCompleteOnboarding: vi.fn(),
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: auth.session }),
  useNativeLogin: () => auth.native,
  useDemoLogin: auth.useDemoLogin,
  useCompleteOnboarding: auth.useCompleteOnboarding,
}));

beforeEach(() => {
  auth.session = { demoMode: false, googleConfigured: true, needsOnboarding: false };
  auth.demo.mutate.mockClear();
  auth.onboarding.mutate.mockClear();
  auth.useDemoLogin.mockReset().mockReturnValue(auth.demo);
  auth.useCompleteOnboarding.mockReset().mockReturnValue(auth.onboarding);
});

async function submitSetup(label: string) {
  fireEvent.change(screen.getByLabelText('서비스 닉네임'), { target: { value: '새플레이어' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /이용약관/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: '만 14세 이상입니다.' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('authentication dialog responsibilities', () => {
  it('shows login methods without mounting onboarding or demo forms in production', () => {
    render(<LoginDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Google로 시작하기/ })).toBeTruthy();
    expect(screen.queryByLabelText('서비스 닉네임')).toBeNull();
    expect(auth.useDemoLogin).not.toHaveBeenCalled();
    expect(auth.useCompleteOnboarding).not.toHaveBeenCalled();
  });

  it('shows four social methods and keeps testing login outside the product UI', () => {
    auth.session.demoMode = true;
    render(<LoginDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    for (const label of ['X로 시작하기', '카카오로 시작하기', 'Discord로 시작하기', 'Google로 시작하기']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByLabelText('서비스 닉네임')).toBeNull();
    expect(screen.queryByText('테스트 계정 선택')).toBeNull();
    expect(auth.useDemoLogin).not.toHaveBeenCalled();
  });

  it('keeps required onboarding independent and non-dismissible with its own mutation', async () => {
    const onSuccess = vi.fn();
    render(<OnboardingDialog open onSuccess={onSuccess} />);
    expect(screen.getByRole('dialog', { name: '어떤 이름으로 만날까요?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Google로 시작하기/ })).toBeNull();
    expect(screen.queryByText('테스트 계정 선택')).toBeNull();
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
    await submitSetup('가입 완료하기');
    await waitFor(() =>
      expect(auth.onboarding.mutate).toHaveBeenCalledWith(
        { nickname: '새플레이어', acceptedTerms: true, ageConfirmed: true },
        { onSuccess },
      ),
    );
    expect(auth.useDemoLogin).not.toHaveBeenCalled();
  });
});
