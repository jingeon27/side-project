'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { StoriesLink } from './StoriesLink';

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname !== '/') return;
    const forwardLegacyStories = () => {
      if (window.location.hash === '#stories') router.replace('/stories' + window.location.search);
    };
    forwardLegacyStories();
    window.addEventListener('hashchange', forwardLegacyStories);
    return () => window.removeEventListener('hashchange', forwardLegacyStories);
  }, [pathname, router]);

  const storyContext = pathname.startsWith('/cards/') ? 'location' : undefined;
  return (
    <header className="site-header">
      <div className="site-width header-inner">
        <Link href="/" className="wordmark" aria-label="덕담집 홈">
          <Image
            className="wordmark-icon"
            src="/images/deokdam-mark.png"
            alt=""
            width={36}
            height={36}
            unoptimized
          />
          <span>덕담집</span>
        </Link>
        <nav aria-label="주 메뉴">
          <StoriesLink surface="header" current={pathname === '/stories' ? 'page' : storyContext}>
            이야기
          </StoriesLink>
          <Link href="/reading" aria-current={pathname === '/reading' ? 'page' : undefined}>
            내 사주
          </Link>
          <Link href="/journal" aria-current={pathname === '/journal' ? 'page' : undefined}>
            기록장
          </Link>
        </nav>
      </div>
    </header>
  );
}
