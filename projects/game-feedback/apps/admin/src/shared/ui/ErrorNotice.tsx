/**
 * 세션 만료(AUTH_REQUIRED)는 라우터의 만료 화면이 알린다. 숨겨 둔 화면에 같은 오류를 그리면 다시 로그인한 뒤에도
 * 남으므로 여기서는 그리지 않는다. shared는 SDK와 features를 가져오지 않아 features/auth의 isAuthRequired와 같은
 * 기준(errorCode)을 직접 읽는다.
 */
const isSessionExpiry = (error: unknown) =>
  error instanceof Error && 'errorCode' in error && error.errorCode === 'AUTH_REQUIRED';

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error || isSessionExpiry(error)) return null;
  return (
    <p role="alert" className="admin-error">
      {error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'}
    </p>
  );
}
