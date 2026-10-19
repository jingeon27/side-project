export const dialogStyles = {
  backdrop:
    'fixed inset-0 z-dialog bg-scrim transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0',
  viewport: 'fixed inset-0 z-dialog flex items-center justify-center px-4 py-6 desktop:px-6',
  popup:
    'relative max-h-[90dvh] w-full max-w-app overflow-y-auto rounded-card bg-surface p-6 text-ink shadow-sheet outline-none transition-[opacity,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
  sheetViewport:
    'fixed inset-x-0 top-[var(--visual-viewport-top,0px)] z-dialog flex h-[var(--visual-viewport-height,100dvh)] items-end justify-center',
  sheetPopup:
    'relative max-h-[calc(100%_-_16px)] w-full max-w-app overflow-y-auto overscroll-contain rounded-t-card border-b-0 bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink shadow-sheet outline-none transition-[opacity,translate] duration-200 data-ending-style:translate-y-full data-ending-style:opacity-0 data-starting-style:translate-y-full data-starting-style:opacity-0 motion-reduce:transition-none',
  title: 'text-title text-ink',
  description: 'mt-2 text-body text-muted',
} as const;
