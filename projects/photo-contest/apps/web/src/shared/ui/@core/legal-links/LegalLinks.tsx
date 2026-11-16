import Link from 'next/link';

import { ROUTES } from '../../../constants/routes';
import { cn } from '../../../lib/cn.helper';

/**
 * 이용약관·개인정보 처리방침 링크. 다른 메뉴(nav) 안에 둘 때는 `landmark={false}`로 두어
 * 본문의 정책 링크와 같은 이름의 탐색 영역이 한 화면에 겹치지 않게 한다.
 */
export function LegalLinks({ className, landmark = true }: { className?: string; landmark?: boolean }) {
  const links = (
    <>
      <Link
        href={ROUTES.TERMS}
        className="inline-flex min-h-touch items-center text-caption text-muted underline-offset-4 hover:underline active:text-ink"
      >
        이용약관
      </Link>
      <Link
        href={ROUTES.PRIVACY}
        className="inline-flex min-h-touch items-center text-caption font-semibold text-ink underline-offset-4 hover:underline active:opacity-60"
      >
        개인정보 처리방침
      </Link>
    </>
  );
  const linksClassName = cn('flex flex-wrap items-center gap-x-4', className);
  if (!landmark) return <div className={linksClassName}>{links}</div>;
  return (
    <nav aria-label="서비스 정책" className={linksClassName}>
      {links}
    </nav>
  );
}
