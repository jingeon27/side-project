import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderUI, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginDialog } from './LoginDialog';

function render(ui: ReactElement) {
  return renderUI(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

const auth = vi.hoisted(() => ({
  session: { demoMode: false, googleConfigured: true, needsOnboarding: false },
  demo: { mutate: vi.fn(), isPending: false, error: null },
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
  auth.useDemoLogin.mockReset().mockReturnValue(auth.demo);
  auth.useCompleteOnboarding.mockReset();
});

describe('authentication dialog responsibilities', () => {
  it('shows login methods without mounting onboarding or demo forms in production', () => {
    render(<LoginDialog open onOpenChange={() => undefined} onSuccess={() => undefined} />);
    expect(screen.getByRole('button', { name: /Google로 시작하기/ })).toBeTruthy();
    expect(screen.queryByLabelText('서비스 닉네임')).toBeNull();
    expect(auth.useDemoLogin).not.toHaveBeenCalled();
    expect(auth.useCompleteOnboarding).not.toHaveBeenCalled();
  });

  it('shows four social methods and keeps testing login outside the product UI', () => {
    auth.session.demoMode = true;
    render(<LoginDialog open onOpenChange={() => undefined} onSuccess={() => undefined} />);
    for (const label of ['X로 시작하기', '카카오 로그인', 'Discord로 시작하기', 'Google로 시작하기']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByLabelText('서비스 닉네임')).toBeNull();
    expect(screen.queryByText('테스트 계정 선택')).toBeNull();
    expect(auth.useDemoLogin).not.toHaveBeenCalled();
  });
});
