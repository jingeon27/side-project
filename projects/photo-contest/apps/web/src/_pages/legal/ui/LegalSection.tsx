import type { ReactNode } from 'react';

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={id} className="text-title text-ink">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-body leading-relaxed wrap-break-word text-muted">
        {children}
      </div>
    </section>
  );
}
