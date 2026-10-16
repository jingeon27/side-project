import type { ReactNode } from 'react';
export function Decision({ children, title = '선택의 이유' }: { children?: ReactNode; title?: string }) {
  return (
    <aside className="mdx-note note-decision">
      <strong className="note-title">{title}</strong>
      <div>{children}</div>
    </aside>
  );
}
