import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from 'react';

import { Button, buttonVariants, FormActions } from '@side/design-system';

import { trackEvent, type TCaseEntryPoint } from '../analytics';
import { visitSource, type TLaunchIntent } from '../case-file';
import { caseHref, catalogPath, followCaseLink, returnedKeyPath } from '../case-routes';
import { createInvestigationFunnel } from '../investigation-funnel';
import { InvestigationTimeline } from '../InvestigationTimeline';
import {
  canOpenReturnedKeyStep,
  dropboxImage,
  isReturnedKeyStep,
  nextReturnedKeyStep,
  readReturnedKeyProgress,
  RETURNED_KEY_ID,
  returnedKeyLabels,
  returnedKeySteps,
  returnedKeyTitle,
  saveReturnedKeyProgress,
  type TReturnedKeyClue,
  type TReturnedKeyStep,
} from './returned-key';
import { DropboxEvidence, EnvelopeEvidence, NightLogEvidence } from './ReturnedKeyEvidence';
import { ReturnedKeyEnding, returnedKeyFormId, ReturnedKeyVerdict } from './ReturnedKeyVerdict';

import './returned-key.css';

const useReturnedKeyFunnel = createInvestigationFunnel({
  landing: returnedKeyPath,
  play: returnedKeyPath,
  isStep: isReturnedKeyStep,
});

const startLabels = {
  start: '조사 시작',
  resume: '이어서 조사',
  ending: '결말 다시 보기',
} satisfies Record<TLaunchIntent, string>;

const nextActions = {
  envelope: { step: 'dropboxes', label: '반납함 비교' },
  dropboxes: { step: 'night-log', label: '야간 일지 보기' },
  'night-log': { step: 'verdict', label: '추리하기' },
} satisfies Record<TReturnedKeyClue, { step: TReturnedKeyStep; label: string }>;

export function ReturnedKeyApp() {
  const [progress, setProgress] = useState(readReturnedKeyProgress);
  const [initialStep] = useState(() => nextReturnedKeyStep(progress));
  const [animatedClue, setAnimatedClue] = useState<TReturnedKeyClue>();
  const content = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const entryPoint = useRef<TCaseEntryPoint | null>(null);
  const funnel = useReturnedKeyFunnel<Record<TReturnedKeyStep | 'landing', Record<string, never>>>({
    id: RETURNED_KEY_ID,
    initial: { step: initialStep, context: {} },
  });
  const route = funnel.step;
  const isLanding = route === 'landing';
  const nextStep = nextReturnedKeyStep(progress);
  const step = route !== 'landing' && canOpenReturnedKeyStep(route, progress) ? route : nextStep;
  const unfinishedIntent = progress.clues.length ? 'resume' : 'start';
  const intent = progress.solved ? 'ending' : unfinishedIntent;
  const nextAction = step === 'verdict' ? null : nextActions[step];
  const suggestedStep = nextAction?.step === nextStep ? nextStep : undefined;
  const previousStep = returnedKeySteps[returnedKeySteps.indexOf(step) - 1];

  const trackArrival = useEffectEvent((next: TReturnedKeyStep, via: TCaseEntryPoint) => {
    if (next === 'verdict') {
      if (!progress.solved) void trackEvent('case_verdict_opened', { entry_point: via }, RETURNED_KEY_ID);
      return;
    }
    void trackEvent('case_evidence_opened', { clue_id: next, entry_point: via }, RETURNED_KEY_ID);
    if (progress.clues.includes(next)) return;
    setProgress(saveReturnedKeyProgress({ ...progress, clues: [...progress.clues, next] }));
    setAnimatedClue(next);
    void trackEvent(
      'case_clue_found',
      { clue_id: next, first_clue: progress.clues.length === 0 },
      RETURNED_KEY_ID,
    );
  });

  useEffect(() => {
    void trackEvent(
      isLanding ? 'case_landing_viewed' : 'case_opened',
      { source: visitSource() },
      RETURNED_KEY_ID,
    );
    if (isLanding) heading.current?.focus({ preventScroll: true });
  }, [isLanding]);

  useEffect(() => {
    if (isLanding) return;
    const via = entryPoint.current ?? 'history';
    entryPoint.current = null;
    content.current?.scrollTo({ top: 0 });
    content.current?.focus({ preventScroll: true });
    trackArrival(step, via);
  }, [isLanding, step]);

  function handleStart() {
    void trackEvent('case_landing_cta_clicked', { intent }, RETURNED_KEY_ID);
    entryPoint.current = intent === 'start' ? 'start' : 'resume';
    void funnel.history.push(nextStep);
  }

  function handleNavigate(next: TReturnedKeyStep, via: 'timeline' | 'primary' | 'previous') {
    if (next === step || !canOpenReturnedKeyStep(next, progress)) return;
    if (via === 'timeline') {
      void trackEvent(
        'case_timeline_clicked',
        {
          from_step: step,
          to_step: next,
          suggested_next: next === suggestedStep,
        },
        RETURNED_KEY_ID,
      );
    }
    entryPoint.current = via;
    void funnel.history.push(next);
  }

  function handleOpenBriefing() {
    void trackEvent('case_landing_link_clicked', { from_step: step }, RETURNED_KEY_ID);
    void funnel.history.push('landing');
  }

  function handleSolved() {
    if (progress.solved) return;
    setProgress(saveReturnedKeyProgress({ ...progress, solved: true }));
    void trackEvent('case_completed', {}, RETURNED_KEY_ID);
    requestAnimationFrame(() => {
      content.current?.scrollTo({ top: 0 });
      content.current?.focus({ preventScroll: true });
    });
  }

  function handleCatalogLink(event: MouseEvent<HTMLAnchorElement>) {
    void trackEvent(
      'case_catalog_link_clicked',
      { from_step: isLanding ? 'landing' : step },
      RETURNED_KEY_ID,
    );
    followCaseLink(event);
  }

  return (
    <>
      {isLanding && (
        <main className="key-briefing">
          <a
            className={buttonVariants({ variant: 'secondary', size: 'md' })}
            href={caseHref(catalogPath)}
            onClick={handleCatalogLink}
          >
            사건 목록
          </a>
          <div className="key-briefing-layout">
            <img src={dropboxImage} alt="" />
            <div className="key-briefing-copy">
              <p className="key-briefing-time">약 3분</p>
              <h1 ref={heading} tabIndex={-1}>
                {returnedKeyTitle}
              </h1>
              <p>
                동명기록관의 출입문은 밤 10시에 잠겼어요. 그런데 새벽 3시 일지에 사라졌던 열쇠 봉투가
                등장합니다.
              </p>
              <Button type="button" variant="accent" size="lg" onClick={handleStart}>
                {startLabels[intent]}
              </Button>
            </div>
          </div>
        </main>
      )}
      <div className="case-app key-case-app" hidden={isLanding}>
        <div className="case-frame key-investigation-tools">
          <InvestigationTimeline
            step={step}
            steps={returnedKeySteps.map((id) => ({
              id,
              label: returnedKeyLabels[id],
              complete: id === 'verdict' ? progress.solved : progress.clues.includes(id),
              open: canOpenReturnedKeyStep(id, progress),
            }))}
            animatedClue={animatedClue}
            suggestedStep={suggestedStep}
            onSelect={(next) => handleNavigate(next, 'timeline')}
          />
        </div>

        <main className="case-body" ref={content} tabIndex={-1} aria-label={returnedKeyLabels[step]}>
          <div className="case-frame key-workspace">
            {step === 'envelope' && <EnvelopeEvidence />}
            {step === 'dropboxes' && <DropboxEvidence />}
            {step === 'night-log' && <NightLogEvidence />}
            <div hidden={step !== 'verdict'}>
              {progress.solved ? (
                <ReturnedKeyEnding onReview={() => handleNavigate('envelope', 'previous')} />
              ) : (
                <ReturnedKeyVerdict onSolved={handleSolved} />
              )}
            </div>
          </div>
        </main>

        <FormActions className="case-action" contentClassName="case-action-content">
          {previousStep && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="case-return"
              onClick={() => handleNavigate(previousStep, 'previous')}
            >
              {returnedKeyLabels[previousStep]} 보기
            </Button>
          )}
          {!previousStep && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="case-return"
              onClick={handleOpenBriefing}
            >
              사건 소개
            </Button>
          )}
          {nextAction && (
            <Button
              type="button"
              variant="accent"
              size="lg"
              onClick={() => handleNavigate(nextAction.step, 'primary')}
            >
              {nextAction.label}
            </Button>
          )}
          {!nextAction && !progress.solved && (
            <Button type="submit" form={returnedKeyFormId} variant="accent" size="lg">
              추리 제출
            </Button>
          )}
          {!nextAction && progress.solved && (
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
