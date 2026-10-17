'use client';

import { useDemoLogin } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { AccountSetupForm } from './AccountSetupForm';
import { TestAccountPicker } from './TestAccountPicker';
import type { TAccountSetupValues } from '../model/account-setup.schema';

export function DemoLoginSection({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const login = useDemoLogin();
  function handleSubmit({ nickname }: TAccountSetupValues) {
    login.mutate({ nickname }, { onSuccess });
  }
  return (
    <>
      <TestAccountPicker onSuccess={onSuccess} />
      <div className="custom-demo-divider">
        <span>{t('직접 정한 닉네임으로 시작하기')}</span>
      </div>
      <AccountSetupForm
        submitLabel={t('데모로 시작하기')}
        pending={login.isPending}
        error={login.error?.message}
        onSubmit={handleSubmit}
      />
    </>
  );
}
