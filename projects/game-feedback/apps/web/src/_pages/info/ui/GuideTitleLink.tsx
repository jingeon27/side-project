import type { ReactNode } from 'react';

import { ArrowRight } from 'lucide-react';

import { ChildLink, TabLink } from '@/shared/navigation';

interface IGuideTitleLinkProps {
  href: string;
  /** 루트 탭(홈·채팅·프로필·알림)은 탭 메뉴처럼 기록을 바꾼다. 나머지는 가이드를 상위로 두고 연다. */
  tab?: boolean;
  children: ReactNode;
}
export function GuideTitleLink({ href, tab = false, children }: IGuideTitleLinkProps) {
  const content = (
    <>
      <span>{children}</span>
      <ArrowRight aria-hidden size={20} />
    </>
  );
  if (tab)
    return (
      <TabLink href={href} className="guide-title-link">
        {content}
      </TabLink>
    );
  return (
    <ChildLink href={href} className="guide-title-link">
      {content}
    </ChildLink>
  );
}
