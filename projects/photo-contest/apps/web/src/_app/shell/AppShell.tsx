import type { ReactNode } from 'react';

import { DesktopNavigation } from '@/widgets/desktop-nav';

/** 화면이 바뀌어도 남는 공통 틀. 라우트 파일은 위젯을 직접 가져오지 않으므로 여기서 조립한다. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <DesktopNavigation />
      {children}
    </>
  );
}
