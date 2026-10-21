import type { Locale } from '@/entities/article/model/types';
import { author } from '@/shared/config/site';
import { labels } from '@/shared/config/labels';

export function Footer({ locale }: { locale: Locale }) {
  const t = labels(locale);
  return (
    <footer className="site-footer">
      <div className="footer-bottom">
        <span>
          © {new Date().getUTCFullYear()} {t.nav.siteTitle}
        </span>
        <div className="footer-links">
          <a href="https://github.com/jingeon27" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={`mailto:${author.email}`}>{t.common.email}</a>
        </div>
      </div>
    </footer>
  );
}
