'use client';

import type { FormEvent } from 'react';
import { Button } from '@side/design-system';
import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';
import { useNativeLogin } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { isNativeApp } from '@/shared/native';
import { ErrorNotice } from '@/shared/ui';

const labels: Record<TSocialProvider, string> = {
  x: 'X로 시작하기',
  kakao: '카카오로 시작하기',
  discord: 'Discord로 시작하기',
  google: 'Google로 시작하기',
};
interface ISocialLoginFormProps {
  providers: Array<{ provider: TSocialProvider; configured: boolean }>;
  onSuccess: () => void;
}

export function SocialLoginForm({ providers, onSuccess }: ISocialLoginFormProps) {
  const { t } = useI18n();
  const login = useNativeLogin();
  function handleSubmit(event: FormEvent<HTMLFormElement>, provider: TSocialProvider) {
    if (!isNativeApp()) return;
    event.preventDefault();
    login.mutate(provider, {
      onSuccess: (result) => {
        if (result) onSuccess();
      },
    });
  }
  return (
    <div className="form-stack social-login-methods">
      {SocialProviderSchema.options.map((provider) => (
        <form
          key={provider}
          action={`/api/auth/social/${provider}`}
          method="get"
          onSubmit={(event) => handleSubmit(event, provider)}
        >
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            type="submit"
            disabled={
              login.isPending || !providers.some((item) => item.provider === provider && item.configured)
            }
          >
            {t(labels[provider])}
          </Button>
        </form>
      ))}
      <ErrorNotice message={login.error?.message} />
      {!providers.some((item) => item.configured) && (
        <p className="muted small">{t('로그인 방법을 준비하고 있어요.')}</p>
      )}
    </div>
  );
}
