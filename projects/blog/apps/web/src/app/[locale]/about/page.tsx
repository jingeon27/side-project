import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/routing';
import { pageMetadata } from '@/shared/lib/seo/metadata';
import { AboutProfile } from '@/widgets/about-profile/ui/about-profile';

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return pageMetadata(locale, 'about');
}
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <main id="main-content" className="page-container about-page">
      <AboutProfile locale={locale} />
    </main>
  );
}
