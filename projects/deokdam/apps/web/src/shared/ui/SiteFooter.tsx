import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-width site-footer">
      <span>덕담집</span>
      <nav aria-label="서비스 정보">
        <Link href="/privacy">개인정보 안내</Link>
        <Link href="/shop">7일 풀이</Link>
      </nav>
    </footer>
  );
}
