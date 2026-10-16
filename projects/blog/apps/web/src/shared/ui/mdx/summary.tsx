import type { ReactNode } from 'react';
export function Summary({ children, title = '요약' }: { children?: ReactNode; title?: string }) {
  return (
    <aside className="mdx-note note-summary">
      <strong className="note-title">{title}</strong>
      <div>{children}</div>
    </aside>
  );
}
