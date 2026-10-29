import { notFound } from 'next/navigation';

import { AnalyticsOptOut } from '@/features/analytics-consent/ui/analytics-opt-out';
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
      <section>
        <h2>{t.sections.analytics.heading}</h2>
        <p>{t.sections.analytics.body}</p>
      </section>
      <section>
        <h2>{t.sections.heatmaps.heading}</h2>
        <p>{t.sections.heatmaps.body}</p>
      </section>
      <section>
        <h2>{t.sections.processors.heading}</h2>
        <p>{t.sections.processors.body}</p>
      </section>
      <section>
        <h2>{t.sections.retention.heading}</h2>
        <p>{t.sections.retention.body}</p>
      </section>
      <section>
        <h2>{t.optOut.heading}</h2>
        <p>{t.optOut.body}</p>
        <AnalyticsOptOut locale={locale} />
      </section>
      <section>
        <h2>{t.contact.heading}</h2>
        <p>{t.contact.body}</p>
        <p>
          <a href={`mailto:${author.email}`}>{author.email}</a>
        </p>
      </section>
    </main>
  );
}
