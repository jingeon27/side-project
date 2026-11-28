import { useEffect, useEffectEvent, useRef, useState, type ComponentType, type MouseEvent } from 'react';

import { Button, buttonVariants, FormActions } from '@side/design-system';

import { trackEvent, type TCaseEntryPoint, type TCaseId } from './analytics';
import { visitSource } from './case-file';
import { caseHref, catalogPath, followCaseLink } from './case-routes';
import { evidenceProgress } from './evidence-progress';
import { EvidenceCaseBriefing } from './EvidenceCaseBriefing';
import { createInvestigationFunnel } from './investigation-funnel';
import { InvestigationTimeline } from './InvestigationTimeline';
import type { TMusicClue } from './music-roll/music-roll';
import type { TWetMapClue } from './wet-map/wet-map';

import './comparison-case.css';

type TClue = TWetMapClue | TMusicClue;
type TStep = TClue | 'verdict';

interface IComparisonCase {
  id: TCaseId;
  path: string;
  cover: string;
  briefing: { title: string; briefing: string; minutes: number };
  clues: readonly { id: TClue; label: string; action: string; View: ComponentType }[];
  formId: string;
  Verdict: ComponentType<{ onSolved: () => void }>;
  Ending: ComponentType;
}

export function createComparisonCase(config: IComparisonCase) {
  const clueIds = config.clues.map(({ id }) => id);
  const steps: TStep[] = [...clueIds, 'verdict'];
  const getLabel = (step: TStep) => config.clues.find(({ id }) => id === step)?.label ?? '추리';
  const useFunnel = createInvestigationFunnel({
    landing: config.path,
    play: config.path,
    isStep: (value) => steps.some((step) => step === value),
  });
  const { readProgress, saveProgress, nextStep } = evidenceProgress(config.id, clueIds);

  return function ComparisonCase() {
    const [progress, setProgress] = useState(readProgress);
    const [initialStep] = useState(() => nextStep(progress));
    const [animatedClue, setAnimatedClue] = useState<TClue>();
    const heading = useRef<HTMLHeadingElement>(null);
    const body = useRef<HTMLElement>(null);
    const entry = useRef<TCaseEntryPoint | null>(null);
    const funnel = useFunnel<Record<TStep | 'landing', Record<string, never>>>({
      id: config.id,
      initial: { step: initialStep, context: {} },
    });
    const isLanding = funnel.step === 'landing';
    const pending = nextStep(progress);
    const route = funnel.step === 'landing' ? pending : funnel.step;
    const step = route === 'verdict' ? pending : route;
    const unfinishedIntent = progress.clues.length ? 'resume' : 'start';
    const intent = progress.solved ? 'ending' : unfinishedIntent;
    const next = steps[steps.indexOf(step) + 1];
    const nextAction = next === 'verdict' ? pending : next;
    const currentClue = config.clues.find(({ id }) => id === step);
    const Evidence = currentClue?.View;

    const recordArrival = useEffectEvent((arrived: TStep, via: TCaseEntryPoint) => {
      if (arrived === 'verdict') {
        if (!progress.solved) void trackEvent('case_verdict_opened', { entry_point: via }, config.id);
        return;
      }
      void trackEvent('case_evidence_opened', { clue_id: arrived, entry_point: via }, config.id);
      if (progress.clues.includes(arrived)) return;
      setProgress(saveProgress({ ...progress, clues: [...progress.clues, arrived] }));
      setAnimatedClue(arrived);
      void trackEvent('case_clue_found', { clue_id: arrived, first_clue: !progress.clues.length }, config.id);
    });

    useEffect(() => {
      void trackEvent(
        isLanding ? 'case_landing_viewed' : 'case_opened',
        { source: visitSource() },
        config.id,
      );
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
      void trackEvent('case_catalog_link_clicked', { from_step: isLanding ? 'landing' : step }, config.id);
      followCaseLink(event);
    };

    const handleStart = () => {
      void trackEvent('case_landing_cta_clicked', { intent }, config.id);
      entry.current = intent === 'start' ? 'start' : 'resume';
      void funnel.history.push(pending);
    };

    const handleNavigate = (target: TStep, via: 'primary' | 'timeline') => {
      if (target === step || (target === 'verdict' && pending !== 'verdict')) return;
      if (via === 'timeline') {
        void trackEvent(
          'case_timeline_clicked',
          { from_step: step, to_step: target, suggested_next: target === pending },
          config.id,
        );
      }
      entry.current = via;
      void funnel.history.push(target);
    };

    const handleBriefing = () => {
      void trackEvent('case_landing_link_clicked', { from_step: step }, config.id);
      void funnel.history.push('landing');
    };

    const handleSolved = () => {
      setProgress(saveProgress({ ...progress, solved: true }));
      void trackEvent('case_completed', {}, config.id);
      requestAnimationFrame(() => {
        body.current?.scrollTo({ top: 0 });
        body.current?.focus({ preventScroll: true });
      });
    };

    return (
      <>
        {isLanding && (
          <EvidenceCaseBriefing
            title={config.briefing.title}
            description={config.briefing.briefing}
            cover={config.cover}
            minutes={config.briefing.minutes}
            intent={intent}
            heading={heading}
            onCatalogLink={handleCatalogLink}
            onStart={handleStart}
          />
        )}
        <div className="case-app" hidden={isLanding}>
          <div className="case-frame comparison-tools">
            <InvestigationTimeline
              step={step}
              steps={steps.map((id) => ({
                id,
                label: getLabel(id),
                complete: id === 'verdict' ? progress.solved : progress.clues.includes(id),
                open: id !== 'verdict' || pending === 'verdict',
              }))}
              animatedClue={animatedClue}
              suggestedStep={pending === step ? undefined : pending}
              onSelect={(target) => handleNavigate(target, 'timeline')}
            />
          </div>
          <main className="case-body" ref={body} tabIndex={-1} aria-label={getLabel(step)}>
            <div className="case-frame comparison-workspace">
              {Evidence && <Evidence />}
              <div hidden={step !== 'verdict'}>
                {progress.solved ? <config.Ending /> : <config.Verdict onSolved={handleSolved} />}
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
                {nextAction === 'verdict'
                  ? '추리하기'
                  : config.clues.find(({ id }) => id === nextAction)?.action}
              </Button>
            )}
            {step === 'verdict' && !progress.solved && (
              <Button type="submit" form={config.formId} variant="accent" size="lg">
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
  };
}
