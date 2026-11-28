import { useEffect, useRef } from 'react';

import { trackEvent } from './analytics';
import { CASE_ID, receiptCaseTitle, visitSource } from './case-file';
import { caseHref, followCaseLink, receiptLandingPath, returnedKeyPath, wetMapPath } from './case-routes';
import { envelopeImage, RETURNED_KEY_ID, returnedKeyTitle } from './returned-key/returned-key';
import { WET_MAP_ID, wetMap, wetMapCover } from './wet-map/wet-map';

import './case-library.css';

const cases = [
  {
    id: CASE_ID,
    title: receiptCaseTitle,
    premise: '폐점한 지 10년 된 서점의 영수증이 새벽에 다시 찍혔어요.',
    minutes: 5,
    illustration: '/assets/last-receipt-cover.webp',
    path: receiptLandingPath,
  },
  {
    id: RETURNED_KEY_ID,
    title: returnedKeyTitle,
    premise: '출입문이 잠긴 기록관에 사라졌던 열쇠가 돌아왔어요.',
    minutes: 3,
    illustration: envelopeImage,
    path: returnedKeyPath,
  },
  {
    id: WET_MAP_ID,
    title: wetMap.title,
    premise: wetMap.premise,
    minutes: wetMap.minutes,
    illustration: wetMapCover,
    path: wetMapPath,
  },
] as const;

export function CaseLibrary() {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    void trackEvent('case_catalog_viewed', { source: visitSource() });
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="case-library">
      <h1 ref={heading} tabIndex={-1}>
        새벽 기록실
      </h1>
      <nav aria-label="사건 목록">
        <ul className="case-library-grid" role="list">
          {cases.map(({ id, title, premise, minutes, illustration, path }) => (
            <li key={id}>
              <a
                className="case-library-card"
                data-case={id}
                href={caseHref(path)}
                aria-labelledby={id + '-title'}
                onClick={(event) => {
                  void trackEvent('case_catalog_selected', { source: visitSource() }, id);
                  followCaseLink(event);
                }}
              >
                <img src={illustration} alt="" />
                <div className="case-library-copy">
                  <p className="case-library-time">약 {minutes}분</p>
                  <h2 id={id + '-title'}>{title}</h2>
                  <p className="case-library-premise">{premise}</p>
                  <span className="case-library-action">사건 보기</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
