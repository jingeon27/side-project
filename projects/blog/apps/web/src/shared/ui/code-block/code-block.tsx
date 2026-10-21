'use client';

import { Children, isValidElement, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { useLocale } from 'next-intl';

import { labels } from '@/shared/config/labels';

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return textContent(child.props.children);
      return '';
    })
    .join('');
}

function highlightedLines(node: ReactNode): string[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; 'data-line'?: unknown }>(child)) return [];
    if ('data-line' in child.props) return [textContent(child.props.children)];
    return highlightedLines(child.props.children);
  });
}

export function CodeBlock({
  children,
  ...props
}: ComponentPropsWithoutRef<'pre'> & { 'data-language'?: string }) {
  const [copied, setCopied] = useState(false);
  const locale = useLocale();
  const t = labels(locale === 'en' ? 'en' : 'ko');
  async function copy() {
    const lines = highlightedLines(children);
    const source = lines.length ? `${lines.join('\n')}\n` : textContent(children);
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The code remains selectable when clipboard is unavailable. */
    }
  }
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{props['data-language'] ?? 'code'}</span>
        <button type="button" onClick={copy} aria-label={copied ? t.article.copied : t.article.copyCode}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {copied ? (
              <path d="m5 12 4 4L19 6" />
            ) : (
              <>
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V4H4v12h4" />
              </>
            )}
          </svg>
          <span>{copied ? t.article.copied : t.article.copyCode}</span>
        </button>
      </div>
      <pre {...props} tabIndex={0}>
        {children}
      </pre>
      <span className="sr-only" role={copied ? 'status' : undefined}>
        {copied ? t.article.copied : ''}
      </span>
    </div>
  );
}
