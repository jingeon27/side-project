'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/shared/ui/button';
import { ErrorNotice } from '@/shared/ui/states';
const schema = z.object({
  nickname: z.string().trim().min(1, '닉네임을 입력해 주세요.').max(24, '24자 이내로 입력해 주세요.'),
});
export function Login() {
  const [config, setConfig] = useState<{ developmentLogin: boolean; google: boolean; kakao: boolean }>();
  const [error, setError] = useState('');
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { nickname: '' },
  });
  useEffect(() => {
    let active = true;
    fetch('/backend/auth/config')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (active) {
          setConfig(data);
          if (new URLSearchParams(window.location.search).has('loginError'))
            setError('소셜 로그인에 실패했습니다. 다시 시도해 주세요.');
        }
      })
      .catch(() => {
        if (active) setError('로그인 설정을 불러오지 못했습니다.');
      });
    return () => {
      active = false;
    };
  }, []);
  async function handleLogin(values: z.infer<typeof schema>) {
    setError('');
    try {
      const response = await fetch('/backend/auth/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error((await response.json()).message ?? '로그인에 실패했습니다.');
      window.location.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    }
  }
  return (
    <section className="login-card">
      <span className="eyebrow">친구들과 시작하는 작은 대회</span>
      <h2>로그인하고 함께 웃어요.</h2>
      <p className="muted">초대받은 그룹에서만 사진을 볼 수 있어요.</p>
      <div className="stack">
        <Button
          variant="secondary"
          disabled={!config?.google}
          onClick={() => window.location.assign('/backend/auth/google')}
        >
          Google로 계속하기
        </Button>
        <Button
          className="kakao"
          variant="secondary"
          disabled={!config?.kakao}
          onClick={() => window.location.assign('/backend/auth/kakao')}
        >
          카카오로 계속하기
        </Button>
      </div>
      {config?.developmentLogin && (
        <form className="dev-login" onSubmit={form.handleSubmit(handleLogin)}>
          <p className="muted small">로컬 체험용 로그인</p>
          <label htmlFor="nickname">닉네임</label>
          <div className="row">
            <input id="nickname" placeholder="예: 진건" {...form.register('nickname')} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              시작하기
            </Button>
          </div>
          {form.formState.errors.nickname && (
            <p role="alert" className="field-error">
              {form.formState.errors.nickname.message}
            </p>
          )}
        </form>
      )}
      {config && !config.google && !config.kakao && !config.developmentLogin && (
        <p className="notice">로그인 준비 중입니다. 운영자에게 문의해 주세요.</p>
      )}
      {error && <ErrorNotice message={error} />}
    </section>
  );
}
