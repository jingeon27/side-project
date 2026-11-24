import { Check, LockKeyhole } from 'lucide-react';

import { Button, StatusAnimation } from '@side/design-system';

import {
  Timeline,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from './reui/Timeline';

interface IInvestigationTimeline<TStep extends string> {
  step: TStep;
  steps: readonly { id: TStep; label: string; complete: boolean; open: boolean }[];
  animatedClue?: TStep;
  suggestedStep?: TStep;
  onSelect: (step: TStep) => void;
}

export function InvestigationTimeline<TStep extends string>({
  step,
  steps,
  animatedClue,
  suggestedStep,
  onSelect,
}: IInvestigationTimeline<TStep>) {
  return (
    <Timeline
      value={steps.findIndex(({ id }) => id === step) + 1}
      orientation="horizontal"
      className="investigation-timeline"
      render={<ol aria-label="조사 진행도" role="list" />}
    >
      {steps.map(({ id, label, complete, open }, index) => {
        const current = id === step;
        const suggested = id === suggestedStep;
        const next = steps[index + 1];
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
                {label}
                {complete && <span className="sr-only"> 확인 완료</span>}
                {!open && <span className="sr-only"> 잠김</span>}
              </TimelineTitle>
            </TimelineHeader>
            <TimelineSeparator data-open={Boolean(next?.open)} />
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
