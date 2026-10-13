'use client';
import { Button } from './button';
export function ErrorNotice({ message, retry }: { message?: string; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <p>{message ?? '연결에 실패했습니다. 잠시 후 다시 시도해 주세요.'}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden>
        ✳
      </span>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      불러오는 중…
    </div>
  );
}
