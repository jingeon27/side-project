// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { CSSProperties } from 'react';
import { CircleCheck, Info, TriangleAlert, OctagonX, LoaderCircle } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { cn } from '../../lib/cn.helper';

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
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
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
