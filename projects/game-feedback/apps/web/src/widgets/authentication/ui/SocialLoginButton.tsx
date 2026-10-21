'use client';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { Button } from '@side/design-system';
import type { TSocialProvider } from '@game-feedback/contracts';
import { useI18n } from '@/shared/i18n';

const labels = {
  google: 'Google로 시작하기',
  kakao: '카카오 로그인',
  discord: 'Discord로 시작하기',
  x: 'X로 시작하기',
} satisfies Record<TSocialProvider, string>;

interface ISocialLoginButtonProps {
  provider: TSocialProvider;
  configured: boolean;
  pending: boolean;
  selected?: TSocialProvider;
  returnTo: string;
  onSubmit: (event: FormEvent<HTMLFormElement>, provider: TSocialProvider) => void;
}

export function SocialLoginButton({
  provider,
  configured,
  pending,
  selected,
  returnTo,
  onSubmit,
}: ISocialLoginButtonProps) {
  const { t } = useI18n();
  return (
    <form
      action={`/api/auth/social/${provider}`}
      method="get"
      onSubmit={(event) => onSubmit(event, provider)}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        className="social-login-button"
        data-provider={provider}
        variant="secondary"
        size="lg"
        fullWidth
        type="submit"
        aria-label={t(labels[provider])}
        disabled={pending || !configured}
        loading={pending && selected === provider}
      >
        <span className="social-provider-icon" aria-hidden="true">
          <Image
            src={`/login/${provider}.${provider === 'google' ? 'png' : 'svg'}`}
            alt=""
            width={20}
            height={20}
            unoptimized
          />
        </span>
        <span>{t(labels[provider])}</span>
        {!configured && (
          <span className="social-login-status" aria-hidden="true">
            {t('준비 중')}
          </span>
        )}
      </Button>
    </form>
  );
}
