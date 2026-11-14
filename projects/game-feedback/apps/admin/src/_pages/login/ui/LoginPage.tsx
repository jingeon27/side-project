import type { ReactNode } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AdminLoginInputSchema } from '@game-feedback/contracts';
import { Button, Input } from '@side/design-system';

import { loginMutationOptions } from '@/features/auth';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';

/** children에는 다시 로그인해야 하는 이유처럼 로그인 폼 앞에 둘 안내를 넣는다. */
export function LoginPage({ children }: { children?: ReactNode }) {
  const client = useQueryClient();
  const login = useMutation(loginMutationOptions(client));
  const form = useZodForm(AdminLoginInputSchema, { defaultValues: { username: '', password: '' } });
  const handleLogin = form.handleSubmit((input) => login.mutate(input));
  return (
    <main className="admin-login admin-card form-stack">
      <h1>관리자 로그인이 필요합니다.</h1>
      <p>관리자 전용 아이디와 비밀번호를 입력하세요.</p>
      {children}
      <form className="form-stack" onSubmit={handleLogin}>
        <label>
          아이디
          <Input
            {...form.register('username')}
            autoComplete="username"
            maxLength={64}
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus -- 안내와 함께 열리면 숨긴 작업 화면에서 포커스를 잃은 뒤라 다시 로그인할 입력으로 옮긴다.
            autoFocus={Boolean(children)}
          />
        </label>
        <label>
          비밀번호
          <Input
            {...form.register('password')}
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {Object.keys(form.formState.errors).length > 0 && (
          <p role="alert">아이디와 8자 이상의 비밀번호를 입력해주세요.</p>
        )}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? '로그인 중…' : '관리자 로그인'}
        </Button>
      </form>
      <ErrorNotice error={login.error} />
    </main>
  );
}
