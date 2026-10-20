export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="admin-error">
      {error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'}
    </p>
  );
}
