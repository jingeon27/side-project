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
        <p className="about-headline">{about.headline}</p>
        <div className="about-description">
          <p>{about.description}</p>
          <p>{about.perspective}</p>
        </div>
        <Link className="about-text-link" href={`/${locale}/blog`}>
          {about.readArticles} <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <section className="about-section" aria-labelledby="about-topics">
        <div className="about-section-heading">
          <h2 id="about-topics">{about.topics.title}</h2>
          <p>{about.topics.intro}</p>
        </div>
        <div className="about-topics">
          <article>
            <span className="about-index" aria-hidden="true">
              01
            </span>
            <h3>{about.topics.interface.title}</h3>
            <p>{about.topics.interface.description}</p>
          </article>
          <article>
            <span className="about-index" aria-hidden="true">
              02
            </span>
            <h3>{about.topics.design.title}</h3>
            <p>{about.topics.design.description}</p>
          </article>
          <article>
            <span className="about-index" aria-hidden="true">
              03
            </span>
            <h3>{about.topics.operation.title}</h3>
            <p>{about.topics.operation.description}</p>
          </article>
        </div>
      </section>
      <section className="about-section" aria-labelledby="about-projects">
        <div className="about-section-heading">
          <h2 id="about-projects">{about.projects.title}</h2>
          <p>{about.projects.intro}</p>
        </div>
        <div className="about-projects">
          <article>
            <h3>{about.projects.gameMate.title}</h3>
            <p>{about.projects.gameMate.description}</p>
            <a
              className="about-text-link"
              href={`${author.github}/side-project/tree/main/projects/game-feedback`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {about.projects.gameMate.link} <span aria-hidden="true">↗</span>
            </a>
          </article>
          <article>
            <h3>{about.projects.contest.title}</h3>
            <p>{about.projects.contest.description}</p>
            <a
              className="about-text-link"
              href={`${author.github}/side-project/tree/main/projects/photo-contest`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {about.projects.contest.link} <span aria-hidden="true">↗</span>
            </a>
          </article>
          <article>
            <h3>{about.projects.blog.title}</h3>
            <p>{about.projects.blog.description}</p>
            <a
              className="about-text-link"
              href={`${author.github}/side-project/tree/main/projects/blog`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {about.projects.blog.link} <span aria-hidden="true">↗</span>
            </a>
          </article>
        </div>
      </section>
      <section className="contact-section" aria-labelledby="about-contact">
        <div className="about-section-heading">
          <h2 id="about-contact">{about.contact}</h2>
          <p>{about.contactDescription}</p>
        </div>
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
