import type { ReactNode } from 'react';
import '@/_app/styles/tailwind.css';
export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
