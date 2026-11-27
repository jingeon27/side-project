import Image from 'next/image';
import Link from 'next/link';

export function SiteHeader() {
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
          <Link href="/#stories">이야기</Link>
          <Link href="/reading">내 사주</Link>
          <Link href="/journal">기록장</Link>
        </nav>
      </div>
    </header>
  );
}
