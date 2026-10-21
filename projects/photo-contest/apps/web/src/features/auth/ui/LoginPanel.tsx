'use client';

import { BRIDGE_ERROR_CODE } from '@photo-contest/bridge';
import { BridgeError } from '@photo-contest/bridge/web';
import { CircleAlert, MessageCircle, RotateCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useId, useTransition } from 'react';
import { match } from 'ts-pattern';

import { NEXT_PATH_PARAM } from '@/shared/constants/auth';
import { BACKEND_ROUTES } from '@/shared/constants/routes';
import { getSafeNextPath } from '@/shared/lib/auth-gate.helper';
import { cn } from '@/shared/lib/cn.helper';
import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { ANALYTICS_EVENT, flushAnalytics, trackEvent } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';
import { getErrorMessage } from '@/shared/model/error';
import { useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { LegalLinks } from '@/shared/ui/@core/legal-links';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextField } from '@/shared/ui/@core/text-field';

import { exchangeAppLogin, requestDevLogin } from '../api/auth-request.helper';
import type { TAuthConfig } from '../api/auth-request.helper';
import { PasswordAuthForms } from './PasswordAuthForms';
import { completeLogin } from '../lib/complete-login.helper';
import { savePendingLogin } from '../lib/login-marker.helper';
import { retryAuthConfig, useAuthConfig } from '../model/auth-config.store';
import { devLoginSchema } from '../model/login.schema';

/** OAuth가 실패하면 API가 `/?loginError=1`로 돌려보낸다. */
const LOGIN_ERROR_PARAM = 'loginError';

interface ILoginPanelProps {
  /** 로그인 뒤 돌아갈 경로. 없으면 주소의 `?next=`(proxy가 붙인 원래 경로), 그것도 없으면 홈 */
  nextPath?: string;
  className?: string;
}

type TSocialProvider = 'google' | 'kakao';

const SOCIAL_LOGIN_FAILED = '소셜 로그인에 실패했습니다. 다시 시도해 주세요.';
const DEV_LOGIN_FAILED = '로그인하지 못했어요. 다시 시도해 주세요.';

const isCancelled = (error: unknown) =>
  error instanceof BridgeError && error.code === BRIDGE_ERROR_CODE.Cancelled;

function DevLoginForm({ nextPath }: { nextPath: string }) {
  const bridge = useBridge();
  const form = useZodForm(devLoginSchema, { defaultValues: { nickname: '' } });

  return (
    <form
      onSubmit={form.handleSubmit(async ({ nickname }) => {
        try {
          await requestDevLogin(nickname);
        } catch (error) {
          toast.error(getErrorMessage(error, DEV_LOGIN_FAILED));
          return;
        }
        completeLogin(bridge, 'dev', nextPath);
      })}
      noValidate
      className="flex flex-col gap-3 border-t border-line pt-4"
    >
      <p className="text-caption text-muted">로컬 체험용 로그인</p>
      <TextField
        required
        label="체험 닉네임"
        placeholder="예: 진건"
        autoComplete="nickname"
        enterKeyHint="go"
        error={form.formState.errors.nickname?.message}
        {...form.register('nickname')}
      />
      <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
        시작하기
      </Button>
    </form>
  );
}

/**
 * Google·카카오 로그인. 앱 안이면 시스템 브라우저 로그인(auth.socialLogin)으로 받은 코드를 WebView 쿠키로 바꾸고,
 * 브라우저면 API의 OAuth 시작 주소로 문서를 옮긴다. 사용자가 앱 로그인 창을 닫으면 조용히 머문다.
 */
function LoginMethods({ config, nextPath }: { config: TAuthConfig; nextPath: string }) {
  const bridge = useBridge();
  const [isPending, startTransition] = useTransition();

  const handleSocialLogin = (provider: TSocialProvider) =>
    startTransition(async () => {
      trackEvent(ANALYTICS_EVENT.LoginStarted, { provider });
      if (bridge?.supports('auth.socialLogin')) {
        try {
          await exchangeAppLogin(await bridge.request('auth.socialLogin', { provider }));
        } catch (error) {
          if (!isCancelled(error)) toast.error(getErrorMessage(error, SOCIAL_LOGIN_FAILED));
          return;
        }
        completeLogin(bridge, provider, nextPath);
        return;
      }
      // OAuth가 끝나면 API가 홈으로 돌려보낸다. 다음 문서가 표시를 보고 nextPath로 옮긴다.
      savePendingLogin({ method: provider, next: nextPath });
      await flushAnalytics();
      navigateDocument(BACKEND_ROUTES.AUTH_PROVIDER(provider));
    });

  return (
    <div className="flex flex-col gap-4">
      {config.google || config.kakao ? (
        <div className="flex flex-col gap-2">
          {config.kakao ? (
            <Button
              variant="accent"
              fullWidth
              className="bg-kakao"
              disabled={isPending}
              onClick={() => handleSocialLogin('kakao')}
            >
              <MessageCircle aria-hidden className="size-5 fill-current" />
              카카오로 계속하기
            </Button>
          ) : null}
          {config.google ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={isPending}
              onClick={() => handleSocialLogin('google')}
            >
              <span aria-hidden className="text-title text-brand">
                G
              </span>
              Google로 계속하기
            </Button>
          ) : null}
        </div>
      ) : null}
      {config.developmentLogin ? <DevLoginForm nextPath={nextPath} /> : null}
    </div>
  );
}

/**
 * 로그인 패널(홈, 세션이 끝난 멤버 화면, 초대 화면). 앱 안에서는 소셜 로그인을 앱의 시스템 브라우저로 처리한다.
 * 로그인에 성공하면 같은 origin의 상대 경로(next)로만 돌아간다.
 */
export function LoginPanel({ nextPath, className }: ILoginPanelProps) {
  const headingId = useId();
  const searchParams = useSearchParams();
  const next = getSafeNextPath(nextPath ?? searchParams.get(NEXT_PATH_PARAM));
  const loginFailed = searchParams.has(LOGIN_ERROR_PARAM);
  const authConfig = useAuthConfig();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-5 rounded-card border border-line bg-surface p-6 tablet:p-8',
        className,
      )}
    >
      <div className="pb-2 text-center">
        <p className="text-caption text-muted">친구들과 나누는 웃긴 순간</p>
        <h2 id={headingId} className="mt-2 text-title-lg text-ink">
          로그인하고 함께 웃어요.
        </h2>
        <p className="mt-1 text-body text-muted">로그인하고 그룹에 참여해 사진과 동영상을 나눠보세요.</p>
      </div>
      <PasswordAuthForms nextPath={next} />
      {loginFailed ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-danger-soft p-3 text-label text-danger"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          소셜 로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      {match(authConfig)
        .with({ status: 'loading' }, () => (
          <div role="status" aria-label="로그인 방법을 불러오는 중" className="flex flex-col gap-2">
            <Skeleton className="h-cta w-full" />
            <Skeleton className="h-cta w-full" />
          </div>
        ))
        .with({ status: 'failed' }, () => (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-control bg-sunken p-3">
            <p className="text-body text-ink">로그인 방법을 불러오지 못했어요.</p>
            <Button variant="secondary" size="sm" onClick={retryAuthConfig}>
              <RotateCw aria-hidden className="size-4" />
              다시 시도
            </Button>
          </div>
        ))
        .with({ status: 'ready' }, ({ config }) => <LoginMethods config={config} nextPath={next} />)
        .exhaustive()}
      <div className="border-t border-line pt-3">
        <p className="text-caption text-muted">서비스 이용에 관한 안내를 확인해 주세요.</p>
        <LegalLinks />
      </div>
    </section>
  );
}
