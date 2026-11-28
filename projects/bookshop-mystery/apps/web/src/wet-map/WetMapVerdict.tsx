import { useState, type FormEvent } from 'react';

import { trackEvent } from '../analytics';
import { correctPlate, removalTime, WET_MAP_ID, wetMap } from './wet-map';

export const wetMapFormId = 'wet-map-verdict';

export function WetMapVerdict({ onSolved }: { onSolved: () => void }) {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void trackEvent('case_answer_submitted', {}, WET_MAP_ID);
    const answer = new FormData(event.currentTarget);
    if (answer.get('plate') !== correctPlate?.id) {
      setFeedback('마른 자국의 너비와 홈의 위치를 함께 비교해 보세요.');
      return;
    }
    if (answer.get('time') !== removalTime) {
      setFeedback('사진을 찍기 전이면서, 마른 부분이 다시 젖지 않을 시각을 찾아보세요.');
      return;
    }
    onSolved();
  };

  return (
    <section className="wet-map-evidence" aria-labelledby="wet-map-verdict-title">
      <h1 id="wet-map-verdict-title">무엇이 언제 치워졌을까요?</h1>
      <form id={wetMapFormId} className="wet-map-verdict" onSubmit={handleSubmit}>
        <label>
          지도 위에 있었던 표찰
          <select name="plate" defaultValue="" required>
            <option value="" disabled>
              표찰 선택
            </option>
            {wetMap.plates.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          표찰을 치운 시각
          <select name="time" defaultValue="" required>
            <option value="" disabled>
              시각 선택
            </option>
            {wetMap.moves.map((at) => (
              <option key={at} value={at}>
                {at}
              </option>
            ))}
          </select>
        </label>
        {feedback && <p role="status">{feedback}</p>}
      </form>
    </section>
  );
}

export function WetMapEnding() {
  return (
    <section className="wet-map-evidence" aria-labelledby="wet-map-ending-title">
      <h1 id="wet-map-ending-title">마른 자국이 남긴 시각</h1>
      <p>
        <strong>{correctPlate?.name}</strong>이 빗물을 막았어요. 폭과 홈이 둘 다 마른 자국과 일치했죠.
      </p>
      <p>
        비가 그친 <time>{wetMap.rain.stop}</time>부터 사진을 찍은 <time>{wetMap.mark.foundAt}</time>
        까지, 안내대 물건이 움직인 기록은 <strong>{removalTime}</strong> 한 번뿐이에요.
      </p>
    </section>
  );
}
