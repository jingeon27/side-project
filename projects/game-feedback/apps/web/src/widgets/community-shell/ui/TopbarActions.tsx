import type { ReactNode } from 'react';

export function TopbarActions({ children }: { children: ReactNode }) {
  return <div className="header-actions">{children}</div>;
}
