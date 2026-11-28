import { useState, type FormEvent } from 'react';

import { trackEvent } from '../analytics';
import { directions, matchesRecording, MUSIC_ROLL_ID, musicRoll, playbackTimes } from './music-roll';

export const musicRollFormId = 'music-roll-verdict';

export function MusicRollVerdict({ onSolved }: { onSolved: () => void }) {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = new FormData(event.currentTarget);
    const roll = musicRoll.rolls.find(({ id }) => id === answer.get('roll'));
    const direction = answer.get('direction');
    if (!roll || (direction !== 'left' && direction !== 'right')) return;
    void trackEvent('case_answer_submitted', {}, MUSIC_ROLL_ID);
    const times = playbackTimes(roll.holes, direction);
    if (matchesRecording(times)) {
      onSolved();
      return;
    }
    const mismatch = times.findIndex((time, index) => musicRoll.strikes[index] !== time);
    const played = times[mismatch];
    const recorded = musicRoll.strikes[mismatch];
    setFeedback(
      `${roll.id} 띠를 ${directions[direction]} 넣으면 ${mismatch + 1}번째 종이 ${played}초에 울려요. 녹음의 ${recorded}초와 비교해 보세요.`,
    );
  };

  return (
    <section className="music-evidence" aria-labelledby="roll-verdict-title">
      <h1 id="roll-verdict-title">마지막에 연주한 띠는?</h1>
      <form className="roll-verdict" id={musicRollFormId} onSubmit={handleSubmit}>
        <label>
          사용한 종이띠
          <select name="roll" defaultValue="" required>
            <option value="" disabled>
              종이띠 선택
            </option>
            {musicRoll.rolls.map(({ id }) => (
              <option key={id} value={id}>
                {id} 띠
              </option>
            ))}
          </select>
        </label>
        <label>
          먼저 넣은 쪽
          <select name="direction" defaultValue="" required>
            <option value="" disabled>
              방향 선택
            </option>
            <option value="left">{directions.left}</option>
            <option value="right">{directions.right}</option>
          </select>
        </label>
        {feedback && <p role="status">{feedback}</p>}
      </form>
    </section>
  );
}

export function MusicRollEnding() {
  const gaps = musicRoll.strikes.flatMap((time, index) => {
    const previous = musicRoll.strikes[index - 1];
    return previous === undefined ? [] : [time - previous + '초'];
  });
  return (
    <section className="music-evidence" aria-labelledby="roll-ending-title">
      <h1 id="roll-ending-title">마지막 종소리를 되찾았어요</h1>
      <figure className="music-document">
        <img src="/assets/music-roll-cover.webp" alt="" />
        <figcaption>
          <strong>B 띠의 오른쪽 끝</strong>을 먼저 넣었어요. 구멍 사이의 간격이 {gaps.join(', ')} 순서여야
          마지막 녹음의 네 소리가 그대로 돌아와요.
        </figcaption>
      </figure>
    </section>
  );
}
