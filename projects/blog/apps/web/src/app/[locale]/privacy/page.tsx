import { notFound } from 'next/navigation';

import { labels } from '@/shared/config/labels';
import { author } from '@/shared/config/site';
import { pageMetadata } from '@/shared/lib/seo/metadata';

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  return pageMetadata(locale, 'privacy');
}
export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  const t = labels(locale).privacy;
  return (
    <main id="main-content" className="page-container privacy-page">
      <h1>{t.title}</h1>
      <p className="privacy-updated">{t.updated}</p>
      <p>{t.intro}</p>
      {t.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <p>
        <a href={`mailto:${author.email}`}>{author.email}</a>
      </p>
    </main>
  );
}
