'use client';

import { useWatch } from 'react-hook-form';
import { CoachingPricingTypeSchema } from '@game-feedback/contracts';
import { Input, NativeSelect, NativeSelectOption } from '@side/design-system';
import { coachingRoles, coachingPricingTypes } from '@/features/coaching';
import { useI18n } from '@/shared/i18n';
import { Field } from '@/shared/ui';
import type { TPostComposerForm } from '../model/post-composer.schema';

export function CoachingFields({ form }: { form: TPostComposerForm }) {
  const { t } = useI18n();
  const role = useWatch({ control: form.control, name: 'coaching.role' });
  const pricingType = useWatch({ control: form.control, name: 'coaching.pricing.type' }) ?? 'HOURLY';
  const pricing = coachingPricingTypes.find((item) => item.value === pricingType);
  const amountPlaceholder = {
    HOURLY: '예: 30000',
    MONTHLY: '예: 200000',
    GOAL: '예: 150000',
  } satisfies Record<typeof pricingType, string>;
  const amountError = form.getFieldState('coaching.pricing.amount', form.formState).error;
  const targetError = form.getFieldState('coaching.pricing.targetScore', form.formState).error;
  return (
    <>
      <Field label={t('모집 유형')}>
        <NativeSelect {...form.register('coaching.role')}>
          {coachingRoles.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {t(item.label)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('수강료 기준')}>
        <NativeSelect
          value={pricingType}
          onChange={(event) => {
            const type = CoachingPricingTypeSchema.parse(event.target.value);
            const amount = form.getValues('coaching.pricing.amount') ?? null;
            form.clearErrors('coaching.pricing');
            form.setValue(
              'coaching.pricing',
              type === 'GOAL' ? { type, amount, targetScore: '' } : { type, amount },
              { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
            );
          }}
        >
          {coachingPricingTypes.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {t(item.label)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {pricingType === 'GOAL' && (
        <Field
          label={t('목표 점수')}
          error={targetError ? t('목표 점수를 1~100자로 입력해주세요.') : undefined}
        >
          <Input
            {...form.register('coaching.pricing.targetScore')}
            maxLength={100}
            placeholder={t('예: 9,000 트로피')}
          />
        </Field>
      )}
      <Field
        label={t((role === 'STUDENT' ? pricing?.budgetLabel : pricing?.feeLabel) ?? '시간당 수강료 (원)')}
        hint={t('비워두면 채팅으로 수강료를 협의해요.')}
        error={amountError ? t('수강료를 1~10,000,000원으로 입력해주세요.') : undefined}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={10000000}
          step={1}
          placeholder={t(amountPlaceholder[pricingType])}
          {...form.register('coaching.pricing.amount', {
            setValueAs: (value: unknown) =>
              value === '' || value === null || value === undefined ? null : Number(value),
          })}
        />
      </Field>
    </>
  );
}
