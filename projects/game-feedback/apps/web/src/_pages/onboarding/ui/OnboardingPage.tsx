'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { useSuspenseQuery } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';

import { sessionOptions, useCompleteOnboarding } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { LoadingState } from '@/shared/ui';
import { AccountSetupForm, type TAccountSetupValues } from '@/widgets/authentication';

export function OnboardingPage({ locale, returnTo }: { locale: string; returnTo: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const {
    data: session,
    isFetching,
    error,
  } = useSuspenseQuery({
    ...sessionOptions(),
    refetchOnMount: 'always',
  });
  const onboarding = useCompleteOnboarding();
  useEffect(() => {
    if (isFetching || error || session.needsOnboarding) return;
    router.replace(session.user ? returnTo : appRoutes.login(locale, returnTo));
  }, [isFetching, error, session.needsOnboarding, session.user, router, locale, returnTo]);
  async function handleSubmit({ nickname }: TAccountSetupValues) {
    try {
      await onboarding.mutateAsync({ nickname, acceptedTerms: true, ageConfirmed: true });
      router.replace(returnTo);
    } catch {
      // mutation 오류는 폼에 표시하고 닉네임과 동의 초안을 유지한다.
    }
  }
  if (error && !isFetching) throw error;
  return (
    <section className="onboarding-page" lang={locale} aria-labelledby="onboarding-title">
      <div className="login-page-heading">
        <p className="login-service-name">
          <Image src="/icon.svg" alt="" aria-hidden width={28} height={28} unoptimized />
          {t('Game Mate')}
        </p>
        <h1 id="onboarding-title">{t('회원가입')}</h1>
        <p>{t('사용할 닉네임을 정하고 필수 항목에 동의해 주세요.')}</p>
      </div>
      {isFetching && <LoadingState />}
      <div hidden={isFetching || !session.needsOnboarding}>
        <AccountSetupForm
          submitLabel={t('가입 완료하기')}
          pending={onboarding.isPending || isFetching}
          error={onboarding.error?.message}
          onSubmit={handleSubmit}
        />
      </div>
    </section>
  );
}
