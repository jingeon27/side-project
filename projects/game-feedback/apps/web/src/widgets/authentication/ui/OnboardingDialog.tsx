'use client';

import Image from 'next/image';
import { useCompleteOnboarding } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { BottomSheet } from '@/shared/ui';
import { AccountSetupForm } from './AccountSetupForm';
import type { TAccountSetupValues } from '../model/account-setup.schema';

interface IOnboardingDialogProps {
  open: boolean;
  onSuccess: () => void;
}

export function OnboardingDialog({ open, onSuccess }: IOnboardingDialogProps) {
  const { t } = useI18n();
  const onboarding = useCompleteOnboarding();
  function handleSubmit({ nickname }: TAccountSetupValues) {
    onboarding.mutate({ nickname, acceptedTerms: true, ageConfirmed: true }, { onSuccess });
  }
  return (
    <BottomSheet
      open={open}
      onOpenChange={() => {}}
      dismissible={false}
      title="어떤 이름으로 만날까요?"
      description={t('Game Mate에 오신 것을 환영해요.')}
    >
      <div className="login-icon">
        <Image src="/icon.svg" alt="" aria-hidden width={64} height={64} unoptimized />
      </div>
      <AccountSetupForm
        submitLabel={t('가입 완료하기')}
        pending={onboarding.isPending}
        error={onboarding.error?.message}
        onSubmit={handleSubmit}
      />
    </BottomSheet>
  );
}
