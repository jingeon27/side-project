import Link from 'next/link';
import type { Locale } from '@/entities/article/model/types';
import { labels } from '@/shared/config/labels';
import { ExternalIcon } from '@/shared/ui/icon';

export function Footer({ locale }: { locale: Locale }) {
  const t = labels(locale);
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link href={`/${locale}`} className="footer-wordmark">
            jingeon<span>.</span>
          </Link>
          <p>{t.footer.description}</p>
        </div>
        <div className="footer-links">
          <a href="https://github.com/jingeon27" target="_blank" rel="noopener noreferrer">
            GitHub <ExternalIcon />
          </a>
          <a href="mailto:jingeon27@gmail.com">
            Email <ExternalIcon />
          </a>
          <a href={`/rss/${locale}`}>
            RSS <ExternalIcon />
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getUTCFullYear()} {t.footer.copyright}
        </span>
        <a href="#top">{t.footer.top} ↑</a>
      </div>
    </footer>
  );
}
