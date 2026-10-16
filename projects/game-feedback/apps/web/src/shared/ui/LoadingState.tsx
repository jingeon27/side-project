import { Spinner } from '@side/design-system';
export function LoadingState({ text = '불러오고 있어요' }: { text?: string }) {
  return (
    <div className="state-box">
      <Spinner />
      <p>{text}</p>
    </div>
  );
}
