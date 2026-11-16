'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useSession } from '@/features/auth';
import { openOverlay } from '@/shared/ui';

import { LoginDialog } from '../ui/LoginDialog';
import { onboardingRedirect } from './onboarding-navigation';

export function openLoginDialog(returnTo?: string) {
  openOverlay(
    (control) => (
      <LoginDialog {...control} returnTo={returnTo} onSuccess={() => control.onOpenChange(false)} />
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
