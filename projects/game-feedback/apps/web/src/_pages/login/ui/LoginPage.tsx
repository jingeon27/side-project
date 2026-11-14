'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { match } from 'ts-pattern';

import { appRoutes } from '@game-feedback/bridge';
import type { TLoginFailure } from '@game-feedback/contracts';

import { useSession } from '@/features/auth';
import { trackLoginFailure } from '@/shared/analytics';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';
import { LoginLegalLinks, SocialLoginForm } from '@/widgets/authentication';

export function LoginPage({
  locale,
  returnTo,
  failure,
}: {
  locale: string;
  returnTo: string;
  failure: TLoginFailure | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { session } = useSession();
  useEffect(() => {
    if (session.user && !session.needsOnboarding) router.replace(returnTo);
  }, [session.user, session.needsOnboarding, router, returnTo]);
  useEffect(() => {
    // 취소는 시작한 화면으로 돌아가므로 이 화면에서 모두 볼 수 없다. 로그인 화면으로만 오는 실패를 센다.
    if (failure && failure !== 'cancelled') trackLoginFailure(failure);
  }, [failure]);
  const failureMessage = match(failure)
    .with('cancelled', () => t('로그인이 취소됐어요. 다시 선택해주세요.'))
    .with('expired', () => t('로그인 요청이 만료됐어요. 다시 시도해 주세요.'))
    .with('failed', () => t('로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'))
    .with('banned', () => t('이용이 제한된 소셜 계정으로는 다시 가입할 수 없어요.'))
    .with(null, () => null)
    .exhaustive();
  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="login-page-heading">
        <p className="login-service-name">
          <Image src="/icon.svg" alt="" aria-hidden width={28} height={28} unoptimized />
          {t('Game Mate')}
        </p>
        <h1 id="login-title">{t('로그인')}</h1>
        <p>{t('소셜 계정으로 로그인하세요.')}</p>
      </div>
      <ErrorNotice message={failureMessage} />
      <SocialLoginForm
        providers={session.socialProviders ?? [{ provider: 'google', configured: session.googleConfigured }]}
        returnTo={appRoutes.login(locale, returnTo)}
      />
      <LoginLegalLinks />
    </section>
  );
}
