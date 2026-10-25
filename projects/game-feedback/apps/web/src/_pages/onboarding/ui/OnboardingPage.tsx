'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';

import { completeOnboardingMutationOptions, sessionOptions } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { LoadingState, useNotify } from '@/shared/ui';
import { AccountSetupForm, type TAccountSetupValues } from '@/widgets/authentication';
import { GameProfileLookup } from '@/widgets/game-profile';

export function OnboardingPage({ locale, returnTo }: { locale: string; returnTo: string }) {
  const client = useQueryClient();
  const notify = useNotify();
  const { t } = useI18n();
  const router = useRouter();
  const [playerTag, setPlayerTag] = useState<string | null>(null);
  const {
    data: session,
    isFetching,
    error,
  } = useSuspenseQuery({
    ...sessionOptions(),
    refetchOnMount: 'always',
  });
  const onboarding = useMutation(completeOnboardingMutationOptions(client, notify));
  useEffect(() => {
    if (isFetching || error || session.needsOnboarding) return;
    router.replace(session.user ? returnTo : appRoutes.login(locale, returnTo));
  }, [isFetching, error, session.needsOnboarding, session.user, router, locale, returnTo]);
  async function handleSubmit({ nickname }: TAccountSetupValues) {
    try {
      await onboarding.mutateAsync({
        nickname,
        acceptedTerms: true,
        ageConfirmed: true,
        ...(playerTag ? { playerTag } : {}),
      });
      router.replace(returnTo);
    } catch {
      // mutation 오류는 폼에 표시하고 닉네임과 동의 초안을 유지한다.
    }
  }
  if (error && !isFetching) throw error;
  return (
    <section className="onboarding-page" lang={locale} aria-labelledby="onboarding-title">
      {isFetching && <LoadingState />}
      <div className="onboarding-body" hidden={isFetching || !session.needsOnboarding}>
        <AccountSetupForm
          submitLabel={t('가입 완료하기')}
          pending={onboarding.isPending || isFetching}
          error={onboarding.error?.message}
          onSubmit={handleSubmit}
        >
          <div className="login-page-heading">
            <p className="login-service-name">
              <Image src="/icon.svg" alt="" aria-hidden width={28} height={28} unoptimized />
              {t('Game Mate')}
            </p>
            <h1 id="onboarding-title">{t('회원가입')}</h1>
            <p>{t('사용할 닉네임을 정하고 필수 항목에 동의해 주세요.')}</p>
          </div>
          <section className="info-card" aria-labelledby="onboarding-game-profile-title">
            <h2 id="onboarding-game-profile-title">{t('게임 프로필 연결 (선택)')}</h2>
            <p>{t('태그를 조회하면 가입할 때 게임 프로필을 함께 연결해요. 나중에 등록해도 괜찮아요.')}</p>
            <GameProfileLookup
              disabled={onboarding.isPending || isFetching}
              onSelectionChange={(profile) => setPlayerTag(profile?.playerTag ?? null)}
            />
          </section>
        </AccountSetupForm>
      </div>
    </section>
  );
}
