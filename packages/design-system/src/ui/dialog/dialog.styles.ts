export const dialogStyles = {
  backdrop:
    'fixed inset-0 z-dialog bg-scrim transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0',
  viewport: 'fixed inset-0 z-dialog flex items-center justify-center px-4 py-6 desktop:px-6',
  popup:
    'relative max-h-[90dvh] w-full max-w-app overflow-y-auto rounded-card bg-surface p-6 text-ink shadow-sheet outline-none transition-[opacity,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
  title: 'text-title text-ink',
  description: 'mt-2 text-body text-muted',
} as const;
