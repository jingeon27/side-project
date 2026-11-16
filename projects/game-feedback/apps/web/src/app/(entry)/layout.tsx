import type { ReactNode } from 'react';

import { ThemeProvider } from '@/shared/theme';

import '@/_app/styles/tailwind.css';

export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="system">
      <body>
        <ThemeProvider initialPreference="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
