'use client';

import { useEffect, useState } from 'react';
import { labels, type UiLocale } from '@/shared/config/labels';

type Entry = { id: string; title: string; level: 2 | 3 };

export function TableOfContents({ entries, locale }: { entries: Entry[]; locale: UiLocale }) {
  const [active, setActive] = useState(entries[0]?.id ?? '');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (changes) => {
        const visible = changes
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 },
    );
    entries.forEach((entry) => {
      const heading = document.getElementById(entry.id);
      if (heading) observer.observe(heading);
    });
    return () => observer.disconnect();
  }, [entries]);
  if (!entries.length) return null;
  const list = (
    <ol>
      {entries.map((entry) => (
        <li key={entry.id} className={entry.level === 3 ? 'toc-subheading' : undefined}>
          <a
            href={`#${entry.id}`}
            aria-current={active === entry.id ? 'location' : undefined}
            onClick={() => setActive(entry.id)}
          >
            {entry.title}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav className="toc-desktop" aria-label={labels(locale).article.contents}>
        <p className="toc-label">{labels(locale).article.contents}</p>
        {list}
      </nav>
      <details className="toc-mobile">
        <summary>
          {labels(locale).article.contents}
          <span aria-hidden="true">⌄</span>
        </summary>
        <nav aria-label={labels(locale).article.contents}>{list}</nav>
      </details>
    </>
  );
}
