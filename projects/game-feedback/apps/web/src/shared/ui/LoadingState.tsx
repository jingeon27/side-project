import { LoaderCircle } from 'lucide-react';
export function LoadingState({ text = '불러오고 있어요' }: { text?: string }) {
  return (
    <div className="state-box">
      <LoaderCircle size={24} className="spin" />
      <p>{text}</p>
    </div>
  );
}
