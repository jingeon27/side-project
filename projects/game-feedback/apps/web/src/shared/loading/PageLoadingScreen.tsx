import { Spinner } from '@side/design-system';

export function PageLoadingScreen({ text }: { text: string }) {
  return (
    <div className="page-loading-screen" role="status" aria-live="polite">
      <Spinner />
      <p>{text}</p>
    </div>
  );
}
