import type { ReactNode } from 'react';

import { useTranslations } from 'next-intl';

export function Decision({ children, title }: { children?: ReactNode; title?: string }) {
  const t = useTranslations('article');
  return (
    <aside className="mdx-note note-decision">
      <strong className="note-title">{title ?? t('decision')}</strong>
      <div>{children}</div>
    </aside>
  );
}
