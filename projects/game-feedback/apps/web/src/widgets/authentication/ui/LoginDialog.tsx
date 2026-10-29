'use client';

import { appRoutes } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { BottomSheet, type IOverlayControlProps } from '@/shared/ui';

import { LoginLegalLinks } from './LoginLegalLinks';
import { SocialLoginForm } from './SocialLoginForm';

interface ILoginDialogProps extends IOverlayControlProps {
  onSuccess: () => void;
  returnTo?: string;
}

export function LoginDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onSuccess,
  returnTo,
}: ILoginDialogProps) {
  const { t, locale } = useI18n();
  const { session } = useSession();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={t('로그인')}
      description={t('소셜 계정으로 로그인하세요.')}
      className="login-dialog"
    >
      <SocialLoginForm
        providers={session.socialProviders ?? [{ provider: 'google', configured: session.googleConfigured }]}
        onSuccess={onSuccess}
        returnTo={returnTo ?? appRoutes.feed(locale)}
      />
      <LoginLegalLinks />
    </BottomSheet>
  );
}
