import { localeSitemap } from '@/shared/lib/seo/locale-sitemap';

// Next does not pass [locale] to a sitemap route, so each locale declares its own file.
export default function sitemap() {
  return localeSitemap('en');
}
