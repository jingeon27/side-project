import { ButtonLink } from '@side/design-system/next';
import { ArrowUpRight, MessageCircle } from 'lucide-react';

interface IChatWelcomeProps {
  locale: string;
}

export function ChatWelcome({ locale }: IChatWelcomeProps) {
  return (
    <section className="chat-welcome">
      <div className="chat-welcome-art">
        <MessageCircle size={43} />
        <span>✳</span>
      </div>
      <span className="section-eyebrow">A NEW PERSPECTIVE, A NEW CONNECTION</span>
      <h2>
        좋은 플레이 뒤에는
        <br />
        좋은 대화가 있어요.
      </h2>
      <p>
        왼쪽에서 대화를 선택하거나,
        <br />
        라운지에서 함께 이야기할 플레이어를 찾아보세요.
      </p>
      <ButtonLink variant="secondary" size="md" href={`/${locale}`} className="button outline">
        피드백 라운지 둘러보기
        <ArrowUpRight size={16} />
      </ButtonLink>
    </section>
  );
}
