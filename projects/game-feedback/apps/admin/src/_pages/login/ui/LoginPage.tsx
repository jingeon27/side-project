import { Button } from '@side/design-system';
import { useLoginMutation } from '@/features/auth';
import { operatorMode } from '@/shared/config';
import { ErrorNotice } from '@/shared/ui';

export function LoginPage() {
  const login = useLoginMutation();
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
}
