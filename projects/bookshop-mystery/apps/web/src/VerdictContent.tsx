import { useRef, useState, type FormEvent } from 'react';

import { Bookmark, CircleCheck, Lightbulb, RotateCcw, Share2 } from 'lucide-react';

import {
  Button,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  StatusAnimation,
} from '@side/design-system';

import { trackEvent } from './analytics';
import { places, reasons } from './case-file';
import { verdictIsCorrect, workLog } from './case-records';

export const verdictFormId = 'final-verdict';

const hints = [
  '영수증의 두 날짜는 서로 다른 일을 가리켜요. 작업일지에서 어느 시각을 찾아야 할까요?',
  '같은 시각의 기록이 두 줄이에요. 영수증과 시간, 기기 번호가 모두 일치하는 줄을 찾아보세요.',
  '찾은 작업의 코드를 코드표에서 읽어 보세요. 그 작업이 출력물에 남기는 정보가 단서예요.',
] as const;

export function VerdictForm({ onSolved }: { onSolved: () => void }) {
  const [feedback, setFeedback] = useState('');
  const [hintCount, setHintCount] = useState(0);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  function handleRevealHint() {
    if (hintCount >= hints.length) return;
    const next = hintCount + 1;
    setHintCount(next);
    void trackEvent('case_hint_revealed', { hint_index: next });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const place = form.get('place');
    const job = form.get('job');
    const reason = form.get('reason');
    if (typeof place !== 'string' || typeof job !== 'string' || typeof reason !== 'string') return;
    if (!place || !job || !reason) return;
    void trackEvent('case_answer_submitted', {});
    if (verdictIsCorrect(place, job, reason)) {
      setFeedback('');
      onSolved();
      return;
    }
    setFeedback('선택한 조합이 기록과 일치하지 않아요. 수첩에서 근거를 확인해 보세요.');
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  return (
    <div className="evidence-body">
      <h1>최종 추리</h1>
      <form id={verdictFormId} className="verdict-form" onSubmit={handleSubmit}>
        <FormField label="어디에서 출력됐을까요?">
          <NativeSelect
            name="place"
            required
            defaultValue=""
            aria-describedby={feedback ? 'answer-feedback' : undefined}
          >
            <NativeSelectOption value="" disabled>
              장소 선택
            </NativeSelectOption>
            {places.map(({ value, label }) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="어떤 작업 기록이 근거인가요?">
          <NativeSelect
            name="job"
            required
            defaultValue=""
            aria-describedby={feedback ? 'answer-feedback' : undefined}
          >
            <NativeSelectOption value="" disabled>
              작업 기록 선택
            </NativeSelectOption>
            {workLog.map(({ id, at, serial, code }) => (
              <NativeSelectOption key={id} value={id}>
                {`${at} / ${serial} / ${code}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="무슨 작업이었을까요?">
          <NativeSelect
            name="reason"
            required
            defaultValue=""
            aria-describedby={feedback ? 'answer-feedback' : undefined}
          >
            <NativeSelectOption value="" disabled>
              작업 종류 선택
            </NativeSelectOption>
            {reasons.map(({ value, label }) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <p id="answer-feedback" ref={feedbackRef} tabIndex={-1} aria-live="polite" className="form-feedback">
          {feedback}
        </p>
      </form>
      <div className="verdict-hints">
        <Button
          type="button"
          variant="ghost"
          className="hint-trigger"
          icon={<Lightbulb aria-hidden="true" />}
          disabled={hintCount === hints.length}
          focusableWhenDisabled
          onClick={handleRevealHint}
        >
          {hintCount === hints.length ? '마지막 힌트' : hintCount ? '다음 힌트' : '힌트 보기'}
        </Button>
        <p role="status" className="hint-text">
          {hintCount > 0 && hints[hintCount - 1]}
        </p>
      </div>
    </div>
  );
}

interface ICaseEnding {
  followed: boolean;
  animateCompletion: boolean;
  onFollow: () => boolean;
  onReplay: () => void;
}

export function CaseEnding({ followed, animateCompletion, onFollow, onReplay }: ICaseEnding) {
  const [status, setStatus] = useState('');
  const [manualShare, setManualShare] = useState('');

  async function handleShare() {
    const url = new URL('/', window.location.origin);
    url.searchParams.set('from', 'shared');
    const title = '폐점한 서점의 마지막 영수증';
    if (navigator.share) {
      try {
        await navigator.share({ title, url: url.href });
        void trackEvent('case_shared', { method: 'native' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url.href);
      void trackEvent('case_shared', { method: 'copy' });
      setStatus('사건 링크를 복사했어요.');
    } catch {
      setManualShare(url.href);
      setStatus('이 주소를 복사해 공유할 수 있어요.');
    }
  }

  function handleFollow() {
    void trackEvent('case_follow_clicked', {});
    if (onFollow()) {
      void trackEvent('case_interest_saved', { persistence: 'device' });
      setStatus('이 브라우저에 관심을 표시했어요.');
      return;
    }
    setStatus('브라우저에 관심을 저장할 수 없어요.');
  }

  return (
    <div className="evidence-body case-ending">
      <p className="evidence-kicker">
        {animateCompletion ? (
          <StatusAnimation variant="success" loop={false} className="size-5 text-accent-ink" />
        ) : (
          <CircleCheck aria-hidden="true" className="size-5" />
        )}
        사건 해결
      </p>
      <h1>그날의 마지막 한 권</h1>
      <p>
        이관 대장이 가리킨 곳은 동명기록관이었다. 작업일지에 남은 야간 복원 작업에서 노을서점의 마지막 거래가
        다시 출력됐다.
      </p>
      <blockquote>
        “이 동네로 돌아오면, 제일 먼저 여기 들를 것.”
        <cite>마지막 손님이 ‹창가의 우편함›에 남긴 글</cite>
      </blockquote>
      <div className="ending-actions">
        <Button type="button" icon={<Share2 />} onClick={handleShare}>
          사건 공유
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={<Bookmark />}
          onClick={handleFollow}
          disabled={followed}
        >
          {followed ? '관심 표시 완료' : '다음 사건 관심 표시'}
        </Button>
        <Button type="button" variant="ghost" icon={<RotateCcw aria-hidden="true" />} onClick={onReplay}>
          다시 조사
        </Button>
      </div>
      <p role="status" className="form-feedback">
        {status}
      </p>
      {manualShare && (
        <FormField className="manual-share" label="공유 주소">
          <Input readOnly value={manualShare} onFocus={(event) => event.currentTarget.select()} />
        </FormField>
      )}
    </div>
  );
}
