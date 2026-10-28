'use client';

import { useId, type ReactNode } from 'react';

import { ArrowRight } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';

import { appRoutes } from '@game-feedback/bridge';
import { Button, Checkbox, Input } from '@side/design-system';

import { nicknameLength } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field } from '@/shared/ui';

import {
  accountSetupSchema,
  NICKNAME_LENGTH_MESSAGE,
  type TAccountSetupValues,
} from '../model/account-setup.schema';

interface IAccountSetupFormProps {
  children?: ReactNode;
  submitLabel: string;
  pending: boolean;
  /** 번역을 마친 제출 오류 문구 */
  error?: string;
  onSubmit: (values: TAccountSetupValues) => void | Promise<void>;
}

export function AccountSetupForm({
  children,
  submitLabel,
  pending,
  error,
  onSubmit,
}: IAccountSetupFormProps) {
  const { t, locale } = useI18n();
  const formId = useId();
  const form = useZodForm(accountSetupSchema, {
    defaultValues: { nickname: '', acceptedTerms: false, ageConfirmed: false },
  });
  const [agreed, ageConfirmed] = useWatch({ control: form.control, name: ['acceptedTerms', 'ageConfirmed'] });
  const agreementError =
    form.formState.errors.acceptedTerms?.message ?? form.formState.errors.ageConfirmed?.message;
  return (
    <div className="account-setup-layout">
      <div className="account-setup-scroll">
        {children}
        <form
          id={formId}
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="form-stack account-setup-form"
          aria-busy={pending}
        >
          <Field
            label={t('서비스 닉네임')}
            error={
              form.formState.errors.nickname?.message
                ? t(form.formState.errors.nickname.message, nicknameLength)
                : undefined
            }
          >
            <Input
              {...form.register('nickname')}
              minLength={nicknameLength.min}
              maxLength={nicknameLength.max}
              required
              disabled={pending}
              placeholder={t(NICKNAME_LENGTH_MESSAGE, nicknameLength)}
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
                  disabled={pending}
                />
              )}
            />
            <span>
              <a href={appRoutes.terms(locale)} target="_blank" rel="noreferrer">
                {t('이용약관')}
              </a>{' '}
              {t('및')}{' '}
              <a href={appRoutes.privacy(locale)} target="_blank" rel="noreferrer">
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
                  disabled={pending}
                />
              )}
            />
            <span>{t('만 14세 이상입니다.')}</span>
          </label>
          <ErrorNotice message={agreementError ? t(agreementError) : error} />
        </form>
      </div>
      <div className="account-setup-actions">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          type="submit"
          form={formId}
          disabled={!agreed || !ageConfirmed}
          loading={pending}
        >
          {!pending && <ArrowRight aria-hidden size={18} />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
