import Linkify from 'linkify-react';
import type { Opts } from 'linkifyjs';

const linkOptions = {
  defaultProtocol: 'https',
  target: '_blank',
  rel: 'nofollow ugc noopener noreferrer',
  validate: {
    email: false,
    url: (_value, token) => /^https?:\/\//i.test(token.toHref('https')),
  },
} satisfies Opts;

export function ChatMessageBody({ body }: { body: string }) {
  return (
    <Linkify as="p" options={linkOptions}>
      {body}
    </Linkify>
  );
}
