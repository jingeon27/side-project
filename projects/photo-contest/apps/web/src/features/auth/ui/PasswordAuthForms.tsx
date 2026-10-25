'use client';

import { useMutation } from '@apollo/client/react';
import { Tabs } from '@base-ui/react/tabs';

import { LoginWithPasswordDocument, RegisterWithPasswordDocument } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';
import { getErrorMessage } from '@/shared/model/error';
import { useZodForm } from '@/shared/model/form';
import { Button } from '@/shared/ui/@core/button';
import { TextField } from '@/shared/ui/@core/text-field';

import { completeLogin } from '../lib/complete-login.helper';
import { passwordLoginSchema, passwordRegisterSchema } from '../model/login.schema';

function PasswordLoginForm({ nextPath }: { nextPath: string }) {
  const bridge = useBridge();
  const form = useZodForm(passwordLoginSchema, { defaultValues: { loginId: '', password: '' } });
  const [login] = useMutation(LoginWithPasswordDocument, { context: { errorToast: false } });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        form.clearErrors('root');
        trackEvent(ANALYTICS_EVENT.LoginStarted, { provider: 'password' });
        try {
          await login({ variables: values });
          completeLogin(bridge, 'password', nextPath);
        } catch (error) {
          form.setError('root', {
            message: getErrorMessage(error, '로그인하지 못했어요. 다시 시도해 주세요.'),
          });
        }
      })}
    >
      <TextField
        required
        label="아이디"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={24}
        error={form.formState.errors.loginId?.message}
        {...form.register('loginId')}
      />
      <TextField
        required
        label="비밀번호"
        type="password"
        autoComplete="current-password"
        maxLength={128}
        error={form.formState.errors.password?.message}
        {...form.register('password')}
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-body text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
        아이디로 로그인
      </Button>
    </form>
  );
}

function PasswordRegisterForm({ nextPath }: { nextPath: string }) {
  const bridge = useBridge();
  const form = useZodForm(passwordRegisterSchema, {
    defaultValues: { loginId: '', password: '', nickname: '' },
  });
  const [register] = useMutation(RegisterWithPasswordDocument, { context: { errorToast: false } });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        form.clearErrors('root');
        try {
          await register({ variables: values });
          completeLogin(bridge, 'password', nextPath);
        } catch (error) {
          form.setError('root', {
            message: getErrorMessage(error, '가입하지 못했어요. 다시 시도해 주세요.'),
          });
        }
      })}
    >
      <TextField
        required
        label="아이디"
        description="영문·숫자·밑줄 3~24자. 대소문자는 구분하지 않아요."
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={24}
        error={form.formState.errors.loginId?.message}
        {...form.register('loginId')}
      />
      <TextField
        required
        label="닉네임"
        autoComplete="nickname"
        maxLength={24}
        error={form.formState.errors.nickname?.message}
        {...form.register('nickname')}
      />
      <TextField
        required
        label="비밀번호"
        type="password"
        description="8~128자. 문장처럼 길게 만들어도 좋아요."
        autoComplete="new-password"
        maxLength={128}
        error={form.formState.errors.password?.message}
        {...form.register('password')}
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-body text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
        가입하고 시작하기
      </Button>
    </form>
  );
}

export function PasswordAuthForms({ nextPath }: { nextPath: string }) {
  return (
    <Tabs.Root defaultValue="login" className="flex flex-col gap-4">
      <Tabs.List aria-label="아이디 로그인 방식" className="flex border-b border-line">
        <Tabs.Tab
          value="login"
          className="min-h-touch flex-1 border-b-2 border-transparent text-label text-muted data-active:border-ink data-active:text-ink active:bg-sunken"
        >
          로그인
        </Tabs.Tab>
        <Tabs.Tab
          value="register"
          className="min-h-touch flex-1 border-b-2 border-transparent text-label text-muted data-active:border-ink data-active:text-ink active:bg-sunken"
        >
          회원가입
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="login">
        <PasswordLoginForm nextPath={nextPath} />
      </Tabs.Panel>
      <Tabs.Panel value="register">
        <PasswordRegisterForm nextPath={nextPath} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
