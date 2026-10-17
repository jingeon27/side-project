'use client';

import type { FormEvent } from 'react';
import { Button } from '@side/design-system';
import { ArrowRight } from 'lucide-react';
import { useNativeLogin } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { isNativeApp } from '@/shared/native';
import { ErrorNotice } from '@/shared/ui';

interface IGoogleLoginFormProps {
  configured: boolean;
  onSuccess: () => void;
}

export function GoogleLoginForm({ configured, onSuccess }: IGoogleLoginFormProps) {
  const { t } = useI18n();
  const login = useNativeLogin();
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isNativeApp()) return;
    event.preventDefault();
    login.mutate(undefined, {
      onSuccess: (result) => {
        if (result) onSuccess();
      },
    });
  }
  return (
    <>
      <form action="/api/auth/google" method="get" onSubmit={handleSubmit}>
        <Button
          variant="secondary"
          size="md"
          className="button google-button"
          type="submit"
          disabled={login.isPending || !configured}
        >
          <span className="google-letter">G</span>
          {t('Google로 시작하기')}
          <ArrowRight size={17} />
        </Button>
      </form>
      <ErrorNotice message={login.error?.message} />
      <p className="muted small">
        {configured
          ? t('Google의 공개 이름과 사진은 수집하지 않아요.')
          : t('Google 로그인은 준비 중입니다. 데모로 먼저 둘러보세요.')}
      </p>
    </>
  );
}
