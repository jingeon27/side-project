'use client';
import { openOverlay } from '@/shared/ui';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/features/auth';
import { LoginDialog } from '../ui/LoginDialog';
import { onboardingRedirect } from './onboarding-navigation';

export function openLoginDialog(returnTo?: string) {
  openOverlay(
    ({ isOpen, close, unmount }) => (
      <LoginDialog
        returnTo={returnTo}
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
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const destination = onboardingRedirect(pathname + (search ? `?${search}` : ''), {
    needsOnboarding: session.needsOnboarding,
  });
  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);
  return null;
}
