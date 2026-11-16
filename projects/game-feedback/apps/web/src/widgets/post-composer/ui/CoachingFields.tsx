'use client';

import type { ChangeEvent } from 'react';

import { useWatch } from 'react-hook-form';

import { CoachingPricingTypeSchema } from '@game-feedback/contracts';
import { Input } from '@side/design-system';

import { coachingPricingTypes } from '@/features/coaching';
import { useI18n } from '@/shared/i18n';
import { Field } from '@/shared/ui';

import type { TPostComposerForm } from '../model/post-composer.schema';

const choiceClassName =
  'flex min-h-touch cursor-pointer items-center gap-1.5 rounded-control border border-line-strong px-2 py-2 text-label text-ink has-checked:border-accent-ink has-checked:bg-accent-soft has-checked:text-accent-ink';

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
  const handlePricingChange = (event: ChangeEvent<HTMLInputElement>) => {
    const type = CoachingPricingTypeSchema.parse(event.currentTarget.value);
    const amount = form.getValues('coaching.pricing.amount') ?? null;
    form.clearErrors('coaching.pricing');
    form.setValue(
      'coaching.pricing',
      type === 'GOAL' ? { type, amount, targetScore: '' } : { type, amount },
      { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
    );
  };
  return (
    <>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-label font-semibold text-ink">{t('모집 유형')}</legend>
        <div className="flex flex-wrap gap-1">
          <label className={choiceClassName}>
            <input
              type="radio"
              value="COACH"
              className="size-4 shrink-0 accent-ink"
              {...form.register('coaching.role')}
            />
            {t('수강생 모집')}
          </label>
          <label className={choiceClassName}>
            <input
              type="radio"
              value="STUDENT"
              className="size-4 shrink-0 accent-ink"
              {...form.register('coaching.role')}
            />
            {t('코치 구함')}
          </label>
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-label font-semibold text-ink">{t('수강료 기준')}</legend>
        <div className="flex flex-wrap gap-1">
          <label className={choiceClassName}>
            <input
              type="radio"
              value="HOURLY"
              className="size-4 shrink-0 accent-ink"
              {...form.register('coaching.pricing.type', { onChange: handlePricingChange })}
            />
            {t('시간당')}
          </label>
          <label className={choiceClassName}>
            <input
              type="radio"
              value="MONTHLY"
              className="size-4 shrink-0 accent-ink"
              {...form.register('coaching.pricing.type', { onChange: handlePricingChange })}
            />
            {t('기간 단위')}
          </label>
          <label className={choiceClassName}>
            <input
              type="radio"
              value="GOAL"
              className="size-4 shrink-0 accent-ink"
              {...form.register('coaching.pricing.type', { onChange: handlePricingChange })}
            />
            {t('목표 달성까지')}
          </label>
        </div>
      </fieldset>
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
