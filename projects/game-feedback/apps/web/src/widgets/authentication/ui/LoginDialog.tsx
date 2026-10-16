'use client';
import { useWatch } from 'react-hook-form';
import { ArrowRight, Gamepad2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useCompleteOnboarding, useDemoLogin, useSession } from '@/features/auth';
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
  const { session } = useSession();
  const form = useZodForm(loginFormSchema, {
    defaultValues: { nickname: '', acceptedTerms: false, ageConfirmed: false },
  });
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
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!joining}
      title={getLoginTitle(session)}
      description="플레이메이트에 오신 것을 환영해요."
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
          <form action="/api/auth/google" method="get">
            <button
              className="button google-button"
              type="submit"
              disabled={session && !session.googleConfigured}
            >
              <span className="google-letter">G</span>Google로 시작하기
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="muted small">
            {session && !session.googleConfigured
              ? 'Google 로그인 연결 준비 중 · 데모로 먼저 둘러보세요.'
              : 'Google의 공개 이름과 사진은 수집하지 않아요.'}
          </p>
        </>
      )}
      {(session?.demoMode || joining) && (
        <form onSubmit={form.handleSubmit(handleSubmit)} className="form-stack">
          {session?.demoMode && !joining && (
            <div className="custom-demo-divider">
              <span>직접 정한 닉네임으로 시작하기</span>
            </div>
          )}
          <Field label="서비스 닉네임">
            <input
              {...form.register('nickname')}
              minLength={2}
              maxLength={20}
              required
              placeholder="2~20자로 입력해 주세요"
              autoComplete="nickname"
            />
          </Field>
          <label className="check-row">
            <input type="checkbox" {...form.register('acceptedTerms')} required />
            <span>
              <a href="/ko/terms" target="_blank" rel="noreferrer">
                이용약관
              </a>{' '}
              및{' '}
              <a href="/ko/privacy" target="_blank" rel="noreferrer">
                개인정보 처리방침
              </a>
              에 동의합니다.
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" {...form.register('ageConfirmed')} required />
            <span>만 14세 이상입니다.</span>
          </label>
          <ErrorNotice
            message={
              form.formState.errors.nickname?.message ??
              form.formState.errors.acceptedTerms?.message ??
              form.formState.errors.ageConfirmed?.message ??
              mutation.error?.message
            }
          />
          <button className="button primary full" disabled={mutation.isPending || !agreed || !ageConfirmed}>
            {mutation.isPending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            {joining ? '가입 완료하기' : '데모로 시작하기'}
          </button>
        </form>
      )}
      <p className="login-footer">
        <ShieldCheck size={14} />
        서로를 존중하는 건강한 피드백 공간
      </p>
    </Modal>
  );
}
