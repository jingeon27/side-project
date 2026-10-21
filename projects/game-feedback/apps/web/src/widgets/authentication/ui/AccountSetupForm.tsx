'use client';

import { ArrowRight, LoaderCircle } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';

import { Button, Checkbox, Input } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field } from '@/shared/ui';

import { accountSetupSchema, type TAccountSetupValues } from '../model/account-setup.schema';

interface IAccountSetupFormProps {
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (values: TAccountSetupValues) => void;
}

export function AccountSetupForm({ submitLabel, pending, error, onSubmit }: IAccountSetupFormProps) {
  const { t, locale } = useI18n();
  const form = useZodForm(accountSetupSchema, {
    defaultValues: { nickname: '', acceptedTerms: false, ageConfirmed: false },
  });
  const [agreed, ageConfirmed] = useWatch({ control: form.control, name: ['acceptedTerms', 'ageConfirmed'] });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="form-stack">
      <Field label={t('서비스 닉네임')}>
        <Input
          {...form.register('nickname')}
          minLength={2}
          maxLength={20}
          required
          placeholder={t('2~20자로 입력해 주세요')}
          autoComplete="nickname"
        />
      </Field>
      <label className="check-row">
        <Controller
          name="acceptedTerms"
          control={form.control}
          render={({ field }) => (
            <Checkbox
              name={field.name}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={() => field.onBlur()}
              inputRef={field.ref}
              required
            />
          )}
        />
        <span>
          <a href={`/${locale}/terms`} target="_blank" rel="noreferrer">
            {t('이용약관')}
          </a>{' '}
          {t('및')}{' '}
          <a href={`/${locale}/privacy`} target="_blank" rel="noreferrer">
            {t('개인정보 처리방침')}
          </a>
          {t('에 동의합니다.')}
        </span>
      </label>
      <label className="check-row">
        <Controller
          name="ageConfirmed"
          control={form.control}
          render={({ field }) => (
            <Checkbox
              name={field.name}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={() => field.onBlur()}
              inputRef={field.ref}
              required
            />
          )}
        />
        <span>{t('만 14세 이상입니다.')}</span>
      </label>
      <ErrorNotice
        message={
          form.formState.errors.nickname?.message ??
          form.formState.errors.acceptedTerms?.message ??
          form.formState.errors.ageConfirmed?.message ??
          error
        }
      />
      <Button
        variant="primary"
        size="lg"
        fullWidth
        type="submit"
        className="button primary full"
        disabled={pending || !agreed || !ageConfirmed}
      >
        {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
        {submitLabel}
      </Button>
    </form>
  );
}
