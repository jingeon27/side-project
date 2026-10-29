import Link from 'next/link';

import { labels, type UiLocale } from '@/shared/config/labels';
import { author } from '@/shared/config/site';

export function AboutProfile({ locale }: { locale: UiLocale }) {
  const { about } = labels(locale);
  return (
    <>
      <section className="about-intro" aria-labelledby="about-name">
        <p className="role-label">{about.role}</p>
        <h1 id="about-name">{about.title}</h1>
        <div className="about-description">
          <p>{about.description}</p>
          <p>{about.perspective}</p>
        </div>
        <Link className="about-text-link" href={`/${locale}/blog`}>
          {about.readArticles}
        </Link>
        <p className="about-project-links">
          <span>{about.projects.title}</span>
          <a
            href={`${author.github}/side-project/tree/main/projects/game-feedback`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {about.projects.gameMate}
          </a>
          <a
            href={`${author.github}/side-project/tree/main/projects/photo-contest`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {about.projects.contest}
          </a>
        </p>
      </section>
      <section className="contact-section" aria-labelledby="about-contact">
        <h2 id="about-contact">{about.contact}</h2>
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
              <a href={author.github} target="_blank" rel="noopener noreferrer">
                github.com/jingeon27
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
