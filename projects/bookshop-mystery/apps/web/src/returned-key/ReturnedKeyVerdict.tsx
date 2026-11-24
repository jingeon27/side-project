import { useRef, useState, type FormEvent } from 'react';

import { Button, FormField, NativeSelect, NativeSelectOption } from '@side/design-system';

import { trackEvent } from '../analytics';
import { jobCodes, RETURNED_KEY_ID, returnedKeyVerdictIsCorrect, returnSlots } from './returned-key';

export const returnedKeyFormId = 'returned-key-verdict';

export function ReturnedKeyVerdict({ onSolved }: { onSolved: () => void }) {
  const [feedback, setFeedback] = useState('');
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const slot = form.get('slot');
    const job = form.get('job');
    if (typeof slot !== 'string' || !slot || typeof job !== 'string' || !job) return;

    void trackEvent('case_answer_submitted', {}, RETURNED_KEY_ID);
    if (returnedKeyVerdictIsCorrect(slot, job)) {
      onSolved();
      return;
    }

    setFeedback('봉투 자국은 색과 모양을 함께 비교하고, 03:00의 코드는 작업 코드에서 확인해 보세요.');
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  return (
    <section className="key-evidence" aria-labelledby="key-verdict-title">
      <h1 id="key-verdict-title">마지막 추리</h1>
      <form id={returnedKeyFormId} className="verdict-form key-verdict-form" onSubmit={handleSubmit}>
        <FormField label="봉투는 어느 반납함에 들어갔을까요?">
          <NativeSelect name="slot" required defaultValue="">
            <NativeSelectOption value="" disabled>
              반납함 선택
            </NativeSelectOption>
            {returnSlots.map(({ id, name }) => (
              <NativeSelectOption key={id} value={id}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="새벽 3시에 무슨 일이 있었을까요?">
          <NativeSelect name="job" required defaultValue="">
            <NativeSelectOption value="" disabled>
              작업 선택
            </NativeSelectOption>
            {Object.values(jobCodes).map(({ id, label }) => (
              <NativeSelectOption key={id} value={id}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {feedback && (
          <p className="key-feedback" ref={feedbackRef} tabIndex={-1} role="status">
            {feedback}
          </p>
        )}
      </form>
    </section>
  );
}

export function ReturnedKeyEnding({ onReview }: { onReview: () => void }) {
  return (
    <section className="key-evidence key-ending" aria-labelledby="key-ending-title">
      <h1 id="key-ending-title">문은 계속 잠겨 있었어요</h1>
      <p>
        파란 반달 자국은 <strong>골목 반납함</strong>의 표식이었어요. 건물 밖에서도 봉투를 넣을 수 있는
        곳이죠.
      </p>
      <p>
        봉투를 넣은 시각은 <strong>02:52</strong>였어요. 03:00은 야간 담당자가 수거한 봉투를 등록한
        시각입니다.
      </p>
      <Button type="button" variant="secondary" onClick={onReview}>
        봉투 다시 보기
      </Button>
    </section>
  );
}
