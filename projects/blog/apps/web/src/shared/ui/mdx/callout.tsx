import type { ReactNode } from 'react';
export function Callout({
  children,
  title,
  type = 'note',
}: {
  children?: ReactNode;
  title?: string;
  type?: 'note' | 'warning' | 'info';
}) {
  return (
    <aside className={`mdx-note note-callout note-${type}`}>
      {title && <strong className="note-title">{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}
