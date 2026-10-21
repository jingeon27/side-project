import { notFound } from 'next/navigation';

import { labels } from '@/shared/config/labels';
import { author } from '@/shared/config/site';
import { pageMetadata } from '@/shared/lib/seo/metadata';

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  return pageMetadata(locale, 'about');
}
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  const t = labels(locale);
  return (
    <main id="main-content" className="page-container about-page">
      <section className="about-intro">
        <h1>{t.about.title}</h1>
        <p className="role-label">Software Engineer</p>
        <p className="about-description">{t.about.description}</p>
      </section>
      <section className="contact-section">
        <h2>{t.about.contact}</h2>
        <dl className="contact-list">
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${author.email}`}>{author.email}</a>
            </dd>
          </div>
          <div>
            <dt>GitHub</dt>
            <dd>
              <a href="https://github.com/jingeon27" target="_blank" rel="noopener noreferrer">
                github.com/jingeon27
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
