'use client';

import type { FormEvent } from 'react';

import { useMutation } from '@tanstack/react-query';

import type { TSocialProvider } from '@game-feedback/contracts';

import { useNativeLogin } from '@/features/auth';
import { ANALYTICS_EVENT, savePendingLogin, trackEvent } from '@/shared/analytics';
import { useI18n } from '@/shared/i18n';
import { isNativeApp } from '@/shared/native';
import { ErrorNotice } from '@/shared/ui';

import { browserLoginMutationOptions } from '../model/browser-login.mutation-options';
import { SocialLoginButton } from './SocialLoginButton';

interface ISocialLoginFormProps {
  providers: Array<{ provider: TSocialProvider; configured: boolean }>;
  returnTo: string;
  onSuccess?: () => void;
}

export function SocialLoginForm({ providers, returnTo, onSuccess }: ISocialLoginFormProps) {
  const { t } = useI18n();
  const nativeLogin = useNativeLogin();
  const browserLogin = useMutation(browserLoginMutationOptions());
  const pending = nativeLogin.isPending || browserLogin.isPending;
  const selected = nativeLogin.isPending ? nativeLogin.variables : browserLogin.variables?.provider;
  const configured = (provider: TSocialProvider) =>
    providers.some((item) => item.provider === provider && item.configured);
  function handleSubmit(event: FormEvent<HTMLFormElement>, provider: TSocialProvider) {
    event.preventDefault();
    if (pending || !configured(provider)) return;
    savePendingLogin(provider);
    trackEvent(ANALYTICS_EVENT.LoginProviderSelected, { provider });
    if (!isNativeApp()) {
      browserLogin.mutate({ form: event.currentTarget, provider });
      return;
    }
    nativeLogin.mutate(provider, {
      onSuccess: (result) => {
        if (result) onSuccess?.();
      },
    });
  }
  const common = { pending, selected, returnTo, onSubmit: handleSubmit };
  return (
    <div className="social-login-methods">
      <SocialLoginButton {...common} provider="google" configured={configured('google')} />
      <SocialLoginButton {...common} provider="kakao" configured={configured('kakao')} />
      <SocialLoginButton {...common} provider="discord" configured={configured('discord')} />
      <SocialLoginButton {...common} provider="x" configured={configured('x')} />
      <ErrorNotice message={nativeLogin.error?.message ?? browserLogin.error?.message} />
      {!providers.some((item) => item.configured) && (
        <p className="login-unavailable">{t('로그인 방법을 준비하고 있어요.')}</p>
      )}
    </div>
  );
}
