'use client';
import { useI18n } from '@/shared/i18n';
import type { FormEvent } from 'react';
import { isNativeApp } from '@/shared/native';
import { Button } from '@side/design-system';
import { useWatch } from 'react-hook-form';
import { ArrowRight, Gamepad2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useCompleteOnboarding, useDemoLogin, useSession, useNativeLogin } from '@/features/auth';
import type { Session } from '@/shared/api';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field, Modal } from '@/shared/ui';
import { loginFormSchema, type TLoginFormValues } from '../model/login.schema';
import { TestAccountPicker } from './TestAccountPicker';

interface ILoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}
function getLoginTitle(session: Session | undefined) {
  if (session?.needsOnboarding) return '어떤 이름으로 만날까요?';
  if (session?.demoMode) return '함께 플레이할 계정을 골라보세요';
  return '다음 플레이는 함께, 더 좋게';
}
export function LoginDialog({ open, onOpenChange, onSuccess }: ILoginDialogProps) {
  const { t, locale } = useI18n();
  const { session } = useSession();
  const form = useZodForm(loginFormSchema, {
    defaultValues: { nickname: '', acceptedTerms: false, ageConfirmed: false },
  });
  const nativeLogin = useNativeLogin();
  const demo = useDemoLogin();
  const onboarding = useCompleteOnboarding();
  const joining = session?.needsOnboarding ?? false;
  const mutation = joining ? onboarding : demo;
  const [agreed, ageConfirmed] = useWatch({ control: form.control, name: ['acceptedTerms', 'ageConfirmed'] });
  const handleSubmit = (values: TLoginFormValues) => {
    if (joining) {
      onboarding.mutate(
        { nickname: values.nickname, acceptedTerms: true, ageConfirmed: true },
        { onSuccess },
      );
      return;
    }
    demo.mutate({ nickname: values.nickname }, { onSuccess });
  };
  const handleGoogleLogin = (event: FormEvent<HTMLFormElement>) => {
    if (!isNativeApp()) return;
    event.preventDefault();
    nativeLogin.mutate(undefined, {
      onSuccess: (result) => {
        if (result) onSuccess();
      },
    });
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!joining}
      title={getLoginTitle(session)}
      description={t('플레이메이트에 오신 것을 환영해요.')}
    >
      {session?.demoMode && !joining ? (
        <TestAccountPicker onSuccess={onSuccess} />
      ) : (
        <div className="login-icon">
          <Gamepad2 size={34} />
        </div>
      )}
      {!joining && (
        <>
          <form action="/api/auth/google" method="get" onSubmit={handleGoogleLogin}>
            <Button
              variant="secondary"
              size="md"
              className="button google-button"
              type="submit"
              disabled={nativeLogin.isPending || (session && !session.googleConfigured)}
            >
              <span className="google-letter">G</span>
              {t('Google로 시작하기')}
              <ArrowRight size={17} />
            </Button>
          </form>
          <ErrorNotice message={nativeLogin.error?.message} />
          <p className="muted small">
            {session && !session.googleConfigured
              ? t('Google 로그인은 준비 중입니다. 데모로 먼저 둘러보세요.')
              : t('Google의 공개 이름과 사진은 수집하지 않아요.')}
          </p>
        </>
      )}
      {(session?.demoMode || joining) && (
        <form onSubmit={form.handleSubmit(handleSubmit)} className="form-stack">
          {session?.demoMode && !joining && (
            <div className="custom-demo-divider">
              <span>{t('직접 정한 닉네임으로 시작하기')}</span>
            </div>
          )}
          <Field label={t('서비스 닉네임')}>
            <input
              className="ds-input"
              {...form.register('nickname')}
              minLength={2}
              maxLength={20}
              required
              placeholder={t('2~20자로 입력해 주세요')}
              autoComplete="nickname"
            />
          </Field>
          <label className="check-row">
            <input type="checkbox" {...form.register('acceptedTerms')} required />
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
            <input type="checkbox" {...form.register('ageConfirmed')} required />
            <span>{t('만 14세 이상입니다.')}</span>
          </label>
          <ErrorNotice
            message={
              form.formState.errors.nickname?.message ??
              form.formState.errors.acceptedTerms?.message ??
              form.formState.errors.ageConfirmed?.message ??
              mutation.error?.message
            }
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            type="submit"
            className="button primary full"
            disabled={mutation.isPending || !agreed || !ageConfirmed}
          >
            {mutation.isPending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            {joining ? t('가입 완료하기') : t('데모로 시작하기')}
          </Button>
        </form>
      )}
      <p className="login-footer">
        <ShieldCheck size={14} />
        {t('서로를 존중하는 건강한 피드백 공간')}
      </p>
    </Modal>
  );
}
