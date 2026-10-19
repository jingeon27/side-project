'use client';

import { NativeSelect, NativeSelectOption } from '@side/design-system';
import { battleModes } from '@/features/battle';
import { useI18n } from '@/shared/i18n';
import { Field } from '@/shared/ui';
import type { TPostComposerForm } from '../model/post-composer.schema';

export function BattleFields({ form }: { form: TPostComposerForm }) {
  const { t } = useI18n();
  return (
    <Field
      label={t('전투 유형')}
      error={form.formState.errors.battle ? t('전투 유형을 선택해주세요.') : undefined}
    >
      <NativeSelect {...form.register('battle.mode')}>
        {battleModes.map((item) => (
          <NativeSelectOption key={item.value} value={item.value}>
            {t(item.label)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
