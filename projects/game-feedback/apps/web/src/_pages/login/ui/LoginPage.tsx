'use client';
import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { appRoutes } from '@game-feedback/bridge';
import { useSession } from '@/features/auth';
import { SocialLoginForm, LoginLegalLinks } from '@/widgets/authentication';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';

export function LoginPage({
  locale,
  returnTo,
  cancelled,
}: {
  locale: string;
  returnTo: string;
  cancelled: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { session } = useSession();
  useEffect(() => {
    if (session.user && !session.needsOnboarding) router.replace(returnTo);
  }, [session.user, session.needsOnboarding, router, returnTo]);
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
      {cancelled && <ErrorNotice message={t('로그인이 취소됐어요. 다시 선택해주세요.')} />}
      <SocialLoginForm
        providers={session.socialProviders ?? [{ provider: 'google', configured: session.googleConfigured }]}
        returnTo={appRoutes.login(locale, returnTo)}
      />
      <LoginLegalLinks />
    </section>
  );
}
