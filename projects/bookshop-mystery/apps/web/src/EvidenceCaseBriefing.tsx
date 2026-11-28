import type { MouseEvent, RefObject } from 'react';

import { Button, buttonVariants } from '@side/design-system';

import type { TLaunchIntent } from './case-file';
import { caseHref, catalogPath } from './case-routes';

import './evidence-case-briefing.css';

const startLabels = {
  start: '조사 시작',
  resume: '이어서 조사',
  ending: '결말 다시 보기',
} satisfies Record<TLaunchIntent, string>;

interface IEvidenceCaseBriefing {
  title: string;
  description: string;
  cover: string;
  minutes: number;
  intent: TLaunchIntent;
  heading: RefObject<HTMLHeadingElement | null>;
  onCatalogLink: (event: MouseEvent<HTMLAnchorElement>) => void;
  onStart: () => void;
}

export function EvidenceCaseBriefing({
  title,
  description,
  cover,
  minutes,
  intent,
  heading,
  onCatalogLink,
  onStart,
}: IEvidenceCaseBriefing) {
  return (
    <main className="evidence-briefing">
      <a
        className={buttonVariants({ variant: 'secondary', size: 'md' })}
        href={caseHref(catalogPath)}
        onClick={onCatalogLink}
      >
        사건 목록
      </a>
      <div className="evidence-briefing-layout">
        <img src={cover} alt="" fetchPriority="high" />
        <div className="evidence-briefing-copy">
          <p className="evidence-briefing-time">약 {minutes}분</p>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <p>{description}</p>
          <Button type="button" variant="accent" size="lg" onClick={onStart}>
            {startLabels[intent]}
          </Button>
        </div>
      </div>
    </main>
  );
}
