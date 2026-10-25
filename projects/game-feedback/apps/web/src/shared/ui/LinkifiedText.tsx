import Linkify from 'linkify-react';
import type { Opts } from 'linkifyjs';

const linkOptions = {
  defaultProtocol: 'https',
  target: '_blank',
  rel: 'nofollow ugc noopener noreferrer',
  validate: {
    email: false,
    url: (_value, token) => {
      try {
        const url = new URL(token.toHref('https'));
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    },
  },
} satisfies Opts;

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  return (
    <Linkify as="p" className={className} options={linkOptions}>
      {text}
    </Linkify>
  );
}
