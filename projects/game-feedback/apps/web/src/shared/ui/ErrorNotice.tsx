export function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <div role="alert" className="error-notice">
      {message}
    </div>
  ) : null;
}
