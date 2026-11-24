import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { Button, buttonVariants, FormActions } from '@side/design-system';

import {
  trackEvent,
  type TCaseEntryPoint,
  type TPrinterFlipEntryPoint,
  type TRecordEntryPoint,
} from './analytics';
import {
  canOpenStep,
  CASE_ID,
  front,
  investigationIntent,
  nextInvestigationStep,
  printerIds,
  printers,
  readProgress,
  recordIds,
  restartProgress,
  saveProgress,
  stepIds,
  stepLabels,
  visitSource,
  type IOrientation,
  type IProgress,
  type TCaseRoute,
  type TCaseStep,
  type TEvidence,
  type TPrinter,
  type TProp,
  type TRecordDocument,
  type TRenderer,
} from './case-file';
import { recordLabels } from './case-records';
import { caseHref, catalogPath, followCaseLink } from './case-routes';
import { CaseLanding } from './CaseLanding';
import { PrinterControls, PrinterEvidence, ReceiptEvidence } from './EvidenceContent';
import { EvidenceNotebook } from './EvidenceNotebook';
import { useInvestigationFunnel } from './investigation-funnel';
import { InvestigationStage } from './InvestigationStage';
import { InvestigationTimeline } from './InvestigationTimeline';
import { RecordEvidence } from './RecordEvidence';
import { CaseEnding, VerdictForm, verdictFormId } from './VerdictContent';

const followingStep = {
  receipt: 'printers',
  printers: 'record',
  record: 'verdict',
} satisfies Record<TEvidence, TCaseStep>;

const actionLabel = {
  receipt: '영수증 조사',
  printers: '프린터 조사',
  record: '이관 기록 열기',
  verdict: '최종 추리하기',
} satisfies Record<TCaseStep, string>;

export function CaseApp() {
  const [progress, setProgress] = useState(readProgress);
  const [initialStep] = useState(() => nextInvestigationStep(progress));
  const [replaying, setReplaying] = useState(false);
  const [recordDocument, setRecordDocument] = useState<TRecordDocument>(
    () => recordIds.find((id) => !progress.recordDocuments.includes(id)) ?? 'ledger',
  );
  const [printer, setPrinter] = useState<TPrinter>(
    () => printerIds.find((id) => !progress.viewedBottoms.includes(id)) ?? 'printer-a',
  );
  const [pose, setPose] = useState<{ view: TProp; orientation: IOrientation }>();
  const [renderer, setRenderer] = useState<TRenderer | null>(null);
  const [animatedStep, setAnimatedStep] = useState<TCaseStep>();
  const content = useRef<HTMLElement>(null);
  const landingHeading = useRef<HTMLHeadingElement>(null);
  const intent = investigationIntent(progress);
  const entryPoint = useRef<TCaseEntryPoint | null>(intent === 'start' ? 'start' : 'resume');

  const funnel = useInvestigationFunnel<Record<TCaseRoute, Record<string, never>>>({
    id: CASE_ID,
    initial: { step: initialStep, context: {} },
  });
  const route = funnel.step;
  const isLanding = route === 'landing';
  const step = route !== 'landing' && canOpenStep(route, progress) ? route : nextInvestigationStep(progress);
  const suggestedStep =
    step === 'printers' && nextInvestigationStep(progress) === 'record' ? 'record' : undefined;
  const previousStep = stepIds.slice(0, stepIds.indexOf(step)).findLast((id) => canOpenStep(id, progress));
  const showsScene = step === 'receipt' || step === 'printers';
  const views = {
    receipt: 'receipt',
    printers: printer,
    record: 'record',
    verdict: 'desk',
  } satisfies Record<TCaseStep, TProp>;
  const view = views[step];
  const orientation = pose?.view === view ? pose.orientation : front;
  const rotatable = renderer === 'unity' || renderer === 'webgl';
  const currentBottomKnown = progress.viewedBottoms.includes(printer);
  const unknownPrinter = printerIds.find((id) => !progress.viewedBottoms.includes(id));
  const unreadDocument = recordIds.find((id) => !progress.recordDocuments.includes(id));

  function updateProgress(next: IProgress) {
    setProgress(next);
    if (!replaying) saveProgress(next);
  }

  function findClue(clue: TEvidence, next = progress) {
    if (next.clues.includes(clue)) {
      if (next !== progress) updateProgress(next);
      return;
    }
    updateProgress({ ...next, clues: [...next.clues, clue] });
    if (clue !== 'receipt') setAnimatedStep(clue);
    void trackEvent('case_clue_found', { clue_id: clue, first_clue: next.clues.length === 0 });
  }

  function viewRecord(document: TRecordDocument, via: TRecordEntryPoint) {
    const firstView = !progress.recordDocuments.includes(document);
    void trackEvent('case_record_viewed', { document_id: document, entry_point: via, first_view: firstView });
    if (!firstView) return;
    const next = { ...progress, recordDocuments: [...progress.recordDocuments, document] };
    if (next.recordDocuments.length === recordIds.length) {
      findClue('record', next);
      return;
    }
    updateProgress(next);
  }

  const trackArrival = useEffectEvent((next: TCaseStep, via: TCaseEntryPoint) => {
    if (next === 'verdict') {
      if (!progress.solved) void trackEvent('case_verdict_opened', { entry_point: via });
      return;
    }
    void trackEvent('case_evidence_opened', { clue_id: next, entry_point: via });
    if (next === 'receipt') findClue('receipt');
    if (next === 'record') viewRecord(recordDocument, 'step');
  });

  const trackVisit = useEffectEvent((landing: boolean) => {
    void trackEvent(landing ? 'case_landing_viewed' : 'case_opened', { source: visitSource() });
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (isLanding) landingHeading.current?.focus({ preventScroll: true });
    trackVisit(isLanding);
  }, [isLanding]);

  useEffect(() => {
    if (isLanding) return;
    const via = entryPoint.current ?? 'history';
    entryPoint.current = null;
    content.current?.scrollTo({ top: 0 });
    content.current?.focus({ preventScroll: true });
    trackArrival(step, via);
  }, [step, isLanding]);

  function handleOpenLanding() {
    void trackEvent('case_landing_link_clicked', { from_step: step });
    void funnel.history.push('landing');
  }

  function handleStart() {
    void trackEvent('case_landing_cta_clicked', { intent });
    entryPoint.current = intent === 'start' ? 'start' : 'resume';
    void funnel.history.push(nextInvestigationStep(progress));
  }

  function handleNavigate(next: TCaseStep, via: 'primary' | 'previous' | 'timeline') {
    if (next === step || !canOpenStep(next, progress)) return;
    if (via === 'timeline') {
      void trackEvent('case_timeline_clicked', {
        from_step: step,
        to_step: next,
        suggested_next: next === suggestedStep,
      });
    }
    entryPoint.current = via;
    void funnel.history.push(next);
  }

  function handleChoosePrinter(next: TPrinter, via: 'primary' | 'comparison') {
    if (next === printer) return;
    setPrinter(next);
    setPose(undefined);
    void trackEvent('case_printer_selected', { printer_id: next, entry_point: via });
  }

  function handleChooseRecord(next: TRecordDocument, via: 'primary' | 'document') {
    if (next === recordDocument) return;
    setRecordDocument(next);
    viewRecord(next, via);
  }

  function handleFlip(entryPoint: TPrinterFlipEntryPoint) {
    const showBottom = !orientation.underside;
    setPose({ view, orientation: { ...front, underside: showBottom } });
    if (!showBottom) return;
    void trackEvent('case_printer_bottom_viewed', {
      printer_id: printer,
      first_view: !currentBottomKnown,
      entry_point: entryPoint,
    });
    if (currentBottomKnown) return;
    const next = { ...progress, viewedBottoms: [...progress.viewedBottoms, printer] };
    if (next.viewedBottoms.length === printerIds.length) {
      findClue('printers', next);
      return;
    }
    updateProgress(next);
  }

  function handleRotate(x: number, y: number) {
    setPose((current) => {
      const previous = current?.view === view ? current.orientation : front;
      return {
        view,
        orientation: {
          ...previous,
          yaw: (previous.yaw + x) % 360,
          pitch: Math.max(-30, Math.min(30, previous.pitch + y)),
        },
      };
    });
  }

  function handleSolved() {
    if (progress.solved) return;
    updateProgress({ ...progress, solved: true });
    setAnimatedStep('verdict');
    void trackEvent('case_completed', {});
    requestAnimationFrame(() => {
      content.current?.scrollTo({ top: 0 });
      content.current?.focus({ preventScroll: true });
    });
  }

  function handleFollow() {
    const next = { ...progress, followed: true };
    const persisted = replaying ? { ...readProgress(), followed: true } : next;
    if (!saveProgress(persisted)) return false;
    setProgress(next);
    return true;
  }

  function handleReplay() {
    setReplaying(true);
    setProgress(restartProgress(progress.followed));
    setPrinter('printer-a');
    setPose(undefined);
    setAnimatedStep(undefined);
    setRecordDocument('ledger');
    entryPoint.current = 'replay';
    void trackEvent('case_replay_started', {});
    void funnel.history.push('receipt');
  }

  function renderPrimaryAction() {
    if (step === 'verdict') {
      if (progress.solved) {
        return (
          <a
            className={buttonVariants({ variant: 'accent', size: 'lg' })}
            href={caseHref(catalogPath)}
            onClick={(event) => {
              void trackEvent('case_catalog_link_clicked', { from_step: step });
              followCaseLink(event);
            }}
          >
            사건 목록
          </a>
        );
      }
      return (
        <Button key="submit-verdict" fullWidth variant="accent" size="lg" type="submit" form={verdictFormId}>
          추리 제출
        </Button>
      );
    }
    if (step === 'printers' && !currentBottomKnown) {
      return (
        <Button fullWidth variant="accent" size="lg" type="button" onClick={() => handleFlip('primary')}>
          {printers[printer].name} 밑면 보기
        </Button>
      );
    }
    if (step === 'printers' && unknownPrinter) {
      return (
        <Button
          fullWidth
          variant="accent"
          size="lg"
          type="button"
          onClick={() => handleChoosePrinter(unknownPrinter, 'primary')}
        >
          {printers[unknownPrinter].name} 보기
        </Button>
      );
    }
    if (step === 'record' && !progress.clues.includes('record') && unreadDocument) {
      return (
        <Button
          fullWidth
          variant="accent"
          size="lg"
          type="button"
          disabled={unreadDocument === recordDocument}
          onClick={() => handleChooseRecord(unreadDocument, 'primary')}
        >
          {recordLabels[unreadDocument]} 보기
        </Button>
      );
    }
    const following = followingStep[step];
    const next = canOpenStep(following, progress) ? following : nextInvestigationStep(progress);
    return (
      <Button
        key={next}
        fullWidth
        variant="accent"
        size="lg"
        type="button"
        onClick={() => handleNavigate(next, 'primary')}
      >
        {next === 'verdict' && progress.solved ? '결말 다시 보기' : actionLabel[next]}
      </Button>
    );
  }

  return (
    <>
      {isLanding && <CaseLanding intent={intent} heading={landingHeading} onStart={handleStart} />}
      <div className="case-app" hidden={isLanding}>
        <div className="case-frame investigation-tools">
          <InvestigationTimeline
            step={step}
            steps={stepIds.map((id) => ({
              id,
              label: stepLabels[id],
              complete: id === 'verdict' ? progress.solved : progress.clues.includes(id),
              open: canOpenStep(id, progress),
            }))}
            animatedClue={animatedStep === 'verdict' ? undefined : animatedStep}
            suggestedStep={suggestedStep}
            onSelect={(next) => handleNavigate(next, 'timeline')}
          />
          <EvidenceNotebook step={step} progress={progress} />
          <p className="sr-only" role="status">
            {suggestedStep === 'record' ? '프린터 두 대를 확인했어요. 이관 기록을 열 수 있어요.' : ''}
          </p>
        </div>

        <main className="case-body" ref={content} tabIndex={-1} aria-label={stepLabels[step]}>
          <div className="case-frame workspace" data-scene={showsScene}>
            <div className="step-content">
              {step === 'receipt' && <ReceiptEvidence />}
              {step === 'printers' && (
                <PrinterEvidence
                  current={printer}
                  viewed={progress.viewedBottoms}
                  underside={orientation.underside}
                  onChoose={(next) => handleChoosePrinter(next, 'comparison')}
                />
              )}
              {step === 'record' && (
                <RecordEvidence
                  selected={recordDocument}
                  viewed={progress.recordDocuments}
                  onSelect={(next) => handleChooseRecord(next, 'document')}
                />
              )}
              <div hidden={step !== 'verdict'}>
                {progress.solved ? (
                  <CaseEnding
                    followed={progress.followed}
                    animateCompletion={animatedStep === 'verdict'}
                    onFollow={handleFollow}
                    onReplay={handleReplay}
                  />
                ) : (
                  <VerdictForm onSolved={handleSolved} />
                )}
              </div>
            </div>

            {!isLanding && (
              <section className="scene-frame" hidden={!showsScene} aria-label="3D 증거">
                <InvestigationStage
                  view={view}
                  orientation={orientation}
                  onRotate={handleRotate}
                  onRenderer={setRenderer}
                />
                {step === 'printers' && (
                  <PrinterControls
                    underside={orientation.underside}
                    known={currentBottomKnown}
                    rotatable={rotatable}
                    onRotate={handleRotate}
                    onFlip={() => handleFlip('toolbar')}
                  />
                )}
              </section>
            )}
          </div>
        </main>

        <FormActions className="case-action" contentClassName="case-action-content">
          {previousStep ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="case-return"
              onClick={() => handleNavigate(previousStep, 'previous')}
            >
              {stepLabels[previousStep]} 보기
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="case-return"
              onClick={handleOpenLanding}
            >
              사건 소개
            </Button>
          )}
          {renderPrimaryAction()}
        </FormActions>
      </div>
    </>
  );
}
