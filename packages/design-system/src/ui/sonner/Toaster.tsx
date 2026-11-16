// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { CSSProperties } from 'react';

import { Info, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { cn } from '../../lib/cn.helper';
import { StatusAnimation } from '../status-animation/StatusAnimation';

const defaultStyles = {
  fontFamily: 'var(--font-sans)',
  '--normal-bg': 'var(--color-surface)',
  '--normal-text': 'var(--color-ink)',
  '--normal-border': 'var(--color-line-strong)',
  '--border-radius': 'var(--radius-card)',
  '--width': 'min(360px, calc(100vw - 32px))',
  zIndex: 'var(--z-index-toast)',
} satisfies CSSProperties & Record<`--${string}`, string | number>;

export function Toaster({ theme = 'system', className, style, toastOptions, icons, ...props }: ToasterProps) {
  return (
    <Sonner
      {...props}
      theme={theme}
      className={cn('toaster group', className)}
      icons={{
        success: <StatusAnimation variant="success" className="size-5" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <StatusAnimation variant="error" className="size-5 text-danger" />,
        loading: <StatusAnimation variant="loading" className="size-4 text-current" />,
        ...icons,
      }}
      style={{ ...defaultStyles, ...style }}
      toastOptions={{
        ...toastOptions,
        style: {
          minHeight: '56px',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-body)',
          paddingRight: '56px',
          ...toastOptions?.style,
        },
        classNames: {
          ...toastOptions?.classNames,
          closeButton: cn(
            'right-1! left-auto! top-1/2! size-touch! -translate-y-1/2! translate-x-0! transform-none! border-0! bg-transparent!',
            toastOptions?.classNames?.closeButton,
          ),
        },
      }}
    />
  );
}
