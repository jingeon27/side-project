'use client';

import type { ReactNode } from 'react';

import { Button, cn } from '@side/design-system';

import { getContactEmail } from '@/shared/config';
import { useI18n } from '@/shared/i18n';

interface IErrorRecoveryProps {
  title: string;
  onRetry: () => void;
  pending?: boolean;
  className?: string;
  recoveryAction?: ReactNode;
}

export function ErrorRecovery({
  title,
  onRetry,
  pending = false,
  className,
  recoveryAction,
}: IErrorRecoveryProps) {
  const { t } = useI18n();
  const email = getContactEmail();
  return (
    <section
      className={cn('error-recovery', className)}
      role="alert"
      aria-label={`${t(title)} ${t('오류')}`}
      aria-busy={pending}
    >
      <h2>
        {title}
        {t('에 문제가 생겼어요')}
      </h2>
      <p>{t('잠시 후 이 영역을 다시 시도해 주세요.')}</p>
      <Button variant="secondary" size="md" type="button" disabled={pending} onClick={onRetry}>
        {pending ? t('다시 불러오는 중…') : t('다시 시도하기')}
      </Button>
      <p className="error-contact">
        {t('문제가 계속되면 이메일로 문의해주세요.')}
        <br />
        <a href={`mailto:${email}`}>{email}</a>
      </p>
      {recoveryAction}
    </section>
  );
}
