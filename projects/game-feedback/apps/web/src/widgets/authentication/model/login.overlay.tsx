'use client';
import { openOverlay } from '@/shared/ui';
import { useEffect } from 'react';
import { overlay } from 'overlay-kit';
import { useSession } from '@/features/auth';
import { LoginDialog } from '../ui/LoginDialog';
import { OnboardingDialog } from '../ui/OnboardingDialog';

export function openLoginDialog() {
  openOverlay(
    ({ isOpen, close, unmount }) => (
      <LoginDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (open) return;
          close();
          unmount();
        }}
        onSuccess={() => {
          close();
          unmount();
        }}
      />
    ),
    { overlayId: 'login-dialog' },
  );
}
export function AuthOnboarding() {
  const { session } = useSession();
  const pending = session?.needsOnboarding ?? false;
  useEffect(() => {
    if (!pending) return;
    // 서버의 가입 대기 상태를 외부 overlay store와 연결하고 화면 종료 시 해제한다.
    const id = openOverlay(
      ({ isOpen, close, unmount }) => (
        <OnboardingDialog
          open={isOpen}
          onSuccess={() => {
            close();
            unmount();
          }}
        />
      ),
      { overlayId: 'auth-onboarding' },
    );
    return () => overlay.unmount(id);
  }, [pending]);
  return null;
}
