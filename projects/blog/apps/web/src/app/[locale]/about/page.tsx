import { notFound } from 'next/navigation';
import { labels } from '@/shared/config/labels';
import { pageMetadata } from '@/shared/lib/seo/metadata';
import { ExternalIcon } from '@/shared/ui/icon';

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
        <p className="eyebrow">{t.about.eyebrow}</p>
        <h1>{t.about.title}</h1>
        <span className="role-label">
          <span className="status-dot" />
          Software Engineer
        </span>
        <p className="about-description">{t.about.description}</p>
        <p className="about-note">{t.about.note}</p>
      </section>
      <section className="contact-section">
        <div>
          <p className="eyebrow">GET IN TOUCH</p>
          <h2>{t.about.contact}</h2>
          <p>{t.about.contactDescription}</p>
        </div>
        <dl className="contact-list">
          <div>
            <dt>Email</dt>
            <dd>
              <a href="mailto:jingeon27@gmail.com">
                jingeon27@gmail.com
                <ExternalIcon />
              </a>
            </dd>
          </div>
          <div>
            <dt>GitHub</dt>
            <dd>
              <a href="https://github.com/jingeon27" target="_blank" rel="noopener noreferrer">
                github.com/jingeon27
                <ExternalIcon />
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
