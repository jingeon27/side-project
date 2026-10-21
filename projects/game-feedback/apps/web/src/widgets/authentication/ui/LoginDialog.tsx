'use client';

import { appRoutes } from '@game-feedback/bridge';
import { Dialog } from '@side/design-system';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';

import { LoginLegalLinks } from './LoginLegalLinks';
import { SocialLoginForm } from './SocialLoginForm';

interface ILoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  returnTo?: string;
}

export function LoginDialog({ open, onOpenChange, onSuccess, returnTo }: ILoginDialogProps) {
  const { t, locale } = useI18n();
  const { session } = useSession();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('로그인')}
      description={t('소셜 계정으로 로그인하세요.')}
      closeLabel={t('닫기')}
      className="login-dialog max-w-[420px] p-7"
    >
      <SocialLoginForm
        providers={session.socialProviders ?? [{ provider: 'google', configured: session.googleConfigured }]}
        onSuccess={onSuccess}
        returnTo={returnTo ?? appRoutes.feed(locale)}
      />
      <LoginLegalLinks />
    </Dialog>
  );
}
