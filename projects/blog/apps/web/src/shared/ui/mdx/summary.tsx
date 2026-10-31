import type { ReactNode } from 'react';

import { useTranslations } from 'next-intl';

export function Summary({ children, title }: { children?: ReactNode; title?: string }) {
  const t = useTranslations('article');
  return (
    <aside className="mdx-note note-summary">
      <strong className="note-title">{title ?? t('summary')}</strong>
      <div>{children}</div>
    </aside>
  );
}
