'use client';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { BottomSheet } from '@/shared/ui';
import { SocialLoginForm } from './SocialLoginForm';

interface ILoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LoginDialog({ open, onOpenChange, onSuccess }: ILoginDialogProps) {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('로그인')}
      description={t('사용할 로그인 방법을 선택하세요.')}
    >
      <SocialLoginForm
        providers={session.socialProviders ?? [{ provider: 'google', configured: session.googleConfigured }]}
        onSuccess={onSuccess}
      />
    </BottomSheet>
  );
}
