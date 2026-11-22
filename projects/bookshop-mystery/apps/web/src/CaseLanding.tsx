import type { RefObject } from 'react';

import { Button } from '@side/design-system';

import type { TLaunchIntent } from './case-file';

import './landing.css';

const startLabels = {
  start: '조사 시작',
  resume: '이어서 조사',
  ending: '결말 다시 보기',
} satisfies Record<TLaunchIntent, string>;

interface ICaseLanding {
  intent: TLaunchIntent;
  heading: RefObject<HTMLHeadingElement | null>;
  onStart: () => void;
}

export function CaseLanding({ intent, heading, onStart }: ICaseLanding) {
  return (
    <main className="case-landing">
      <section className="landing-hero" aria-labelledby="case-title">
        <img className="landing-cover" src="/assets/last-receipt-cover.webp" alt="" fetchPriority="high" />
        <div className="landing-shell landing-intro">
          <p className="landing-meta">약 5분</p>
          <h1 id="case-title" ref={heading} tabIndex={-1}>
            <span>폐점한 서점의</span> <span>마지막 영수증</span>
          </h1>
          <p className="landing-lede">새벽 2시 13분. 문을 닫은 지 10년 된 서점의 이름이 영수증에 찍혔다.</p>
          <Button className="landing-start" type="button" variant="accent" size="lg" onClick={onStart}>
            {startLabels[intent]}
          </Button>
        </div>
      </section>

      <section className="landing-shell landing-brief" aria-labelledby="brief-title">
        <div>
          <h2 id="brief-title">사건 개요</h2>
          <p>노을서점에 남겨진 자료를 살펴 이 영수증이 어디에서 왜 출력됐는지 밝혀 보세요.</p>
        </div>
        <dl className="brief-details">
          <div>
            <dt>인쇄 일시</dt>
            <dd>
              <time dateTime="2026-11-21T02:13:00+09:00">
                2026.11.21 <strong>02:13</strong>
              </time>
            </dd>
          </div>
          <div>
            <dt>확인할 증거</dt>
            <dd>영수증, 프린터 두 대, 이관 기록</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
