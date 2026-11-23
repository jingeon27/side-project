import { Check, LockKeyhole } from 'lucide-react';

import { Button, StatusAnimation } from '@side/design-system';

import {
  canOpenStep,
  isEvidence,
  stepIds,
  stepLabels,
  type IProgress,
  type TCaseStep,
  type TEvidence,
} from './case-file';
import {
  Timeline,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from './reui/Timeline';

interface IInvestigationTimeline {
  step: TCaseStep;
  progress: IProgress;
  animatedClue?: TEvidence;
  suggestedStep?: TCaseStep;
  onSelect: (step: TCaseStep) => void;
}

export function InvestigationTimeline({
  step,
  progress,
  animatedClue,
  suggestedStep,
  onSelect,
}: IInvestigationTimeline) {
  return (
    <Timeline
      value={stepIds.indexOf(step) + 1}
      orientation="horizontal"
      className="investigation-timeline"
      render={<ol aria-label="조사 진행도" role="list" />}
    >
      {stepIds.map((id, index) => {
        const current = id === step;
        const complete = isEvidence(id) ? progress.clues.includes(id) : progress.solved;
        const open = canOpenStep(id, progress);
        const suggested = id === suggestedStep;
        const next = stepIds[index + 1];
        return (
          <TimelineItem
            key={id}
            step={index + 1}
            completed={complete}
            data-suggested={suggested || undefined}
            render={<li />}
          >
            <TimelineHeader
              render={
                <Button
                  className="timeline-step"
                  type="button"
                  variant="ghost"
                  aria-current={current ? 'step' : undefined}
                  aria-description={suggested ? '다음 단계' : undefined}
                  disabled={!open}
                  onClick={() => onSelect(id)}
                />
              }
            >
              <TimelineIndicator render={<span />}>
                {!open && <LockKeyhole />}
                {open && !complete && (suggested ? '다음' : <span className="timeline-dot" />)}
                {open &&
                  complete &&
                  (animatedClue === id ? (
                    <StatusAnimation
                      variant="success"
                      loop={false}
                      className="timeline-completion-motion"
                      fallback={<Check aria-hidden="true" className="size-3" />}
                    />
                  ) : (
                    <Check />
                  ))}
              </TimelineIndicator>
              <TimelineTitle render={<span />}>
                {stepLabels[id]}
                {complete && <span className="sr-only"> 확인 완료</span>}
                {!open && <span className="sr-only"> 잠김</span>}
              </TimelineTitle>
            </TimelineHeader>
            <TimelineSeparator data-open={Boolean(next && canOpenStep(next, progress))} />
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
