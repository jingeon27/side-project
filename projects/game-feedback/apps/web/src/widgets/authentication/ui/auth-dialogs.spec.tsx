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
vi.mock('./TestAccountPicker', () => ({ TestAccountPicker: () => <p>테스트 계정 선택</p> }));

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

  it('submits demo signup through its own mutation and leaves onboarding untouched', async () => {
    auth.session.demoMode = true;
    const onSuccess = vi.fn();
    render(<LoginDialog open onOpenChange={vi.fn()} onSuccess={onSuccess} />);
    expect(screen.getByText('테스트 계정 선택')).toBeTruthy();
    await submitSetup('데모로 시작하기');
    await waitFor(() =>
      expect(auth.demo.mutate).toHaveBeenCalledWith({ nickname: '새플레이어' }, { onSuccess }),
    );
    expect(auth.useCompleteOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
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
