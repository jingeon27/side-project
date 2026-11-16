/** 번역을 마친 오류 문구를 그대로 보인다. 오류 메시지(문구 키)는 호출부가 `t()`로 한 번 번역한다. */
export function ErrorNotice({ message }: { message?: string | null }) {
  return message ? (
    <div role="alert" className="error-notice">
      {message}
    </div>
  ) : null;
}
