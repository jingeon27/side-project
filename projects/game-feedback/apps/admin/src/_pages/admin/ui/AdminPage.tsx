import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Button, Input } from '@side/design-system';
import { z } from 'zod';
import { sessionOptions, loginMutationOptions, logoutMutationOptions } from '@/features/auth';
import { useAdminRoute, adminUserPath } from '@/shared/lib';
import { useZodForm } from '@/shared/model';
import { AsyncBoundary, ErrorNotice } from '@/shared/ui';
import { operatorMode } from '@/shared/config';
import { SupportInbox } from './SupportInbox';
import { ReportInbox } from './ReportInbox';
import { UserPanel } from './UserPanel';
const userSearchSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,100}$/),
});
export function AdminPage() {
  const client = useQueryClient();
  const { data: session } = useSuspenseQuery(sessionOptions());
  const login = useMutation(loginMutationOptions(client));
  const logout = useMutation(logoutMutationOptions(client));
  const route = useAdminRoute();
  const form = useZodForm(userSearchSchema, { defaultValues: { id: '' } });
  const handleSearch = form.handleSubmit(({ id }) => {
    window.location.hash = adminUserPath(id);
  });
  if (session.user?.role !== 'ADMIN')
    return (
      <main className="admin-login admin-card form-stack">
        <h1>관리자 로그인이 필요합니다.</h1>
        <p>
          {operatorMode
            ? '운영 관리자 세션이 만료되었거나 권한이 없습니다. SSH에서 세션을 발급하고 로컬 관리자 서비스를 다시 실행해주세요.'
            : '기존 관리자 세션을 사용하거나 로컬 테스트 관리자로 로그인하세요.'}
        </p>
        {!operatorMode && (
          <Button type="button" disabled={login.isPending} onClick={() => login.mutate()}>
            로컬 관리자 로그인
          </Button>
        )}
        <ErrorNotice error={login.error} />
      </main>
    );
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <strong>Game Feedback 운영 관리</strong>
        <span>{session.user.nickname}</span>
        <Button type="button" variant="ghost" disabled={logout.isPending} onClick={() => logout.mutate()}>
          로그아웃
        </Button>
      </header>
      <nav className="admin-nav" aria-label="관리자 메뉴">
        {[
          ['support', '문의함'],
          ['reports', '신고함'],
          ['users', '사용자 관리'],
        ].map(([tab, label]) => (
          <a key={tab} href={`#${tab}`} aria-current={route.tab === tab ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <main className="admin-main">
        <ErrorNotice error={logout.error} />
        <AsyncBoundary key={route.tab}>
          {route.tab === 'support' && <SupportInbox threadId={route.threadId} />}
          {route.tab === 'reports' && <ReportInbox />}
          {route.tab === 'users' && (
            <section className="form-stack">
              <h1>사용자 관리</h1>
              <form className="admin-actions" onSubmit={handleSearch}>
                <label>
                  사용자 ID
                  <Input {...form.register('id')} placeholder="사용자 ID를 입력하세요." />
                </label>
                <Button type="submit">조회</Button>
              </form>
              {form.formState.errors.id && <p role="alert">사용자 ID를 확인해주세요.</p>}
              {route.userId && (
                <AsyncBoundary key={route.userId}>
                  <UserPanel userId={route.userId} />
                </AsyncBoundary>
              )}
            </section>
          )}
        </AsyncBoundary>
      </main>
    </div>
  );
}
