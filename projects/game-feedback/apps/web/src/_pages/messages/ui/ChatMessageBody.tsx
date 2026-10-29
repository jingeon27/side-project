import { LinkifiedText } from '@/shared/ui';

export function ChatMessageBody({ body }: { body: string }) {
  return <LinkifiedText text={body} />;
}
