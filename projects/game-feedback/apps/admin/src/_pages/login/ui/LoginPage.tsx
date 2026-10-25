import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AdminLoginInputSchema } from '@game-feedback/contracts';
import { Button, Input } from '@side/design-system';

import { loginMutationOptions } from '@/features/auth';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';

export function LoginPage() {
  const client = useQueryClient();
  const login = useMutation(loginMutationOptions(client));
  const form = useZodForm(AdminLoginInputSchema, { defaultValues: { username: '', password: '' } });
  const handleLogin = form.handleSubmit((input) => login.mutate(input));
  return (
    <main className="admin-login admin-card form-stack">
      <h1>관리자 로그인이 필요합니다.</h1>
      <p>관리자 전용 아이디와 비밀번호를 입력하세요.</p>
      <form className="form-stack" onSubmit={handleLogin}>
        <label>
          아이디
          <Input {...form.register('username')} autoComplete="username" maxLength={64} required />
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
