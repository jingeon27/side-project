import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from 'react';

import { Button, buttonVariants, FormActions } from '@side/design-system';

import { trackEvent, type TCaseEntryPoint } from '../analytics';
import { visitSource } from '../case-file';
import { caseHref, catalogPath, followCaseLink, wetMapPath } from '../case-routes';
import { EvidenceCaseBriefing } from '../EvidenceCaseBriefing';
import { createInvestigationFunnel } from '../investigation-funnel';
import { InvestigationTimeline } from '../InvestigationTimeline';
import {
  isWetMapStep,
  nextWetMapStep,
  readWetMapProgress,
  saveWetMapProgress,
  WET_MAP_ID,
  wetMap,
  wetMapCover,
  wetMapLabels,
  wetMapSteps,
  type TWetMapClue,
  type TWetMapStep,
} from './wet-map';
import { MapMarkEvidence, PlatesEvidence, WorkLogEvidence } from './WetMapEvidence';
import { WetMapEnding, wetMapFormId, WetMapVerdict } from './WetMapVerdict';

import './wet-map.css';

const useWetMapFunnel = createInvestigationFunnel({
  landing: wetMapPath,
  play: wetMapPath,
  isStep: isWetMapStep,
});

const evidence = {
  'map-mark': MapMarkEvidence,
  plates: PlatesEvidence,
  'work-log': WorkLogEvidence,
} satisfies Record<TWetMapClue, () => React.JSX.Element>;

const nextLabels = {
  'map-mark': '지도 보기',
  plates: '표찰 비교',
  'work-log': '일지 보기',
  verdict: '추리하기',
} satisfies Record<TWetMapStep, string>;

export function WetMapApp() {
  const [progress, setProgress] = useState(readWetMapProgress);
  const [initialStep] = useState(() => nextWetMapStep(progress));
  const [animatedClue, setAnimatedClue] = useState<TWetMapClue>();
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLElement>(null);
  const entry = useRef<TCaseEntryPoint | null>(null);
  const funnel = useWetMapFunnel<Record<TWetMapStep | 'landing', Record<string, never>>>({
    id: WET_MAP_ID,
    initial: { step: initialStep, context: {} },
  });
  const isLanding = funnel.step === 'landing';
  const pending = nextWetMapStep(progress);
  const route = funnel.step === 'landing' ? pending : funnel.step;
  const step = route === 'verdict' ? pending : route;
  const unfinishedIntent = progress.clues.length ? 'resume' : 'start';
  const intent = progress.solved ? 'ending' : unfinishedIntent;
  const next = wetMapSteps[wetMapSteps.indexOf(step) + 1];
  const nextAction = next === 'verdict' ? pending : next;
  const Evidence = step === 'verdict' ? null : evidence[step];

  const recordArrival = useEffectEvent((arrived: TWetMapStep, via: TCaseEntryPoint) => {
    if (arrived === 'verdict') {
      if (!progress.solved) void trackEvent('case_verdict_opened', { entry_point: via }, WET_MAP_ID);
      return;
    }
    void trackEvent('case_evidence_opened', { clue_id: arrived, entry_point: via }, WET_MAP_ID);
    if (progress.clues.includes(arrived)) return;
    setProgress(saveWetMapProgress({ ...progress, clues: [...progress.clues, arrived] }));
    setAnimatedClue(arrived);
    void trackEvent('case_clue_found', { clue_id: arrived, first_clue: !progress.clues.length }, WET_MAP_ID);
  });

  useEffect(() => {
    void trackEvent(isLanding ? 'case_landing_viewed' : 'case_opened', { source: visitSource() }, WET_MAP_ID);
    if (isLanding) heading.current?.focus({ preventScroll: true });
  }, [isLanding]);

  useEffect(() => {
    if (isLanding) return;
    const via = entry.current ?? 'history';
    entry.current = null;
    body.current?.scrollTo({ top: 0 });
    body.current?.focus({ preventScroll: true });
    recordArrival(step, via);
  }, [isLanding, step]);

  const handleCatalogLink = (event: MouseEvent<HTMLAnchorElement>) => {
    void trackEvent('case_catalog_link_clicked', { from_step: isLanding ? 'landing' : step }, WET_MAP_ID);
    followCaseLink(event);
  };

  const handleStart = () => {
    void trackEvent('case_landing_cta_clicked', { intent }, WET_MAP_ID);
    entry.current = intent === 'start' ? 'start' : 'resume';
    void funnel.history.push(pending);
  };

  const handleNavigate = (target: TWetMapStep, via: 'primary' | 'timeline') => {
    if (target === step || (target === 'verdict' && pending !== 'verdict')) return;
    if (via === 'timeline') {
      void trackEvent(
        'case_timeline_clicked',
        { from_step: step, to_step: target, suggested_next: target === pending },
        WET_MAP_ID,
      );
    }
    entry.current = via;
    void funnel.history.push(target);
  };

  const handleBriefing = () => {
    void trackEvent('case_landing_link_clicked', { from_step: step }, WET_MAP_ID);
    void funnel.history.push('landing');
  };

  const handleSolved = () => {
    setProgress(saveWetMapProgress({ ...progress, solved: true }));
    void trackEvent('case_completed', {}, WET_MAP_ID);
    requestAnimationFrame(() => {
      body.current?.scrollTo({ top: 0 });
      body.current?.focus({ preventScroll: true });
    });
  };

  return (
    <>
      {isLanding && (
        <EvidenceCaseBriefing
          title={wetMap.title}
          description={wetMap.briefing}
          cover={wetMapCover}
          minutes={wetMap.minutes}
          intent={intent}
          heading={heading}
          onCatalogLink={handleCatalogLink}
          onStart={handleStart}
        />
      )}
      <div className="case-app" hidden={isLanding}>
        <div className="case-frame wet-map-tools">
          <InvestigationTimeline
            step={step}
            steps={wetMapSteps.map((id) => ({
              id,
              label: wetMapLabels[id],
              complete: id === 'verdict' ? progress.solved : progress.clues.includes(id),
              open: id !== 'verdict' || pending === 'verdict',
            }))}
            animatedClue={animatedClue}
            suggestedStep={pending === step ? undefined : pending}
            onSelect={(target) => handleNavigate(target, 'timeline')}
          />
        </div>
        <main className="case-body" ref={body} tabIndex={-1} aria-label={wetMapLabels[step]}>
          <div className="case-frame wet-map-workspace">
            {Evidence && <Evidence />}
            <div hidden={step !== 'verdict'}>
              {progress.solved ? <WetMapEnding /> : <WetMapVerdict onSolved={handleSolved} />}
            </div>
          </div>
        </main>
        <FormActions className="case-action" contentClassName="case-action-content">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="case-return"
            onClick={handleBriefing}
          >
            사건 소개
          </Button>
          {nextAction && (
            <Button
              type="button"
              variant="accent"
              size="lg"
              onClick={() => handleNavigate(nextAction, 'primary')}
            >
              {nextLabels[nextAction]}
            </Button>
          )}
          {step === 'verdict' && !progress.solved && (
            <Button type="submit" form={wetMapFormId} variant="accent" size="lg">
              추리 제출
            </Button>
          )}
          {step === 'verdict' && progress.solved && (
            <a
              className={buttonVariants({ variant: 'accent', size: 'lg' })}
              href={caseHref(catalogPath)}
              onClick={handleCatalogLink}
            >
              사건 목록
            </a>
          )}
        </FormActions>
      </div>
    </>
  );
}
