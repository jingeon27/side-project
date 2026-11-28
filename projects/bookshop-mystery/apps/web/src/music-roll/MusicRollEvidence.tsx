import { useEffect, useRef, useState } from 'react';

import { Check } from 'lucide-react';

import { Button } from '@side/design-system';

import { trackEvent } from '../analytics';
import { directions, MUSIC_ROLL_ID, musicRoll, playbackTimes, type TRollDirection } from './music-roll';

const seconds = Array.from({ length: Math.max(...musicRoll.strikes) + 1 }, (_, second) => second);
const recordedTimes = musicRoll.strikes.map((second) => second + '초').join(', ');

export function BellRecord() {
  const recording = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const player = recording.current;
    return () => player?.pause();
  }, []);

  return (
    <section className="music-evidence" aria-labelledby="bell-record-title">
      <h1 id="bell-record-title">마감 종소리의 녹음</h1>
      <figure className="music-document">
        <img src="/assets/music-roll-record.webp" alt="" />
        <figcaption>
          종이 울린 시각은 <strong>{recordedTimes}</strong>예요. 첫 소리가 난 순간을 0초로 잡았어요.
        </figcaption>
      </figure>
      <audio
        ref={recording}
        className="bell-record-player"
        controls
        preload="none"
        aria-label="전시실 마감 종소리 녹음"
        src="/assets/music-roll-recording.mp3"
        onPlaying={() => void trackEvent('case_recording_played', {}, MUSIC_ROLL_ID)}
      />
    </section>
  );
}

export function FeedGuide() {
  return (
    <section className="music-evidence" aria-labelledby="feed-guide-title">
      <h1 id="feed-guide-title">오르골 구동기</h1>
      <figure className="music-document">
        <img src="/assets/music-roll-guide.webp" alt="" />
        <figcaption>
          구동기는 <strong>{musicRoll.secondsPerCell}초에 한 칸</strong>씩 종이띠를 당겨요. 구멍 하나가 지날
          때마다 같은 종이 한 번 울려요. 어느 쪽 끝이든 먼저 넣은 쪽부터 읽혀요.
        </figcaption>
      </figure>
    </section>
  );
}

export function PaperRolls() {
  const [direction, setDirection] = useState<TRollDirection>('left');

  const handleDirection = (value: TRollDirection) => {
    if (value === direction) return;
    setDirection(value);
    void trackEvent('case_roll_direction_selected', { direction: value }, MUSIC_ROLL_ID);
  };

  return (
    <section className="music-evidence" aria-labelledby="rolls-title">
      <h1 id="rolls-title">운반 상자의 종이띠</h1>
      <fieldset className="roll-direction">
        <legend>먼저 넣을 쪽</legend>
        <div>
          {(['left', 'right'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="md"
              variant={direction === value ? 'secondary' : 'ghost'}
              aria-pressed={direction === value}
              onClick={() => handleDirection(value)}
            >
              {direction === value && <Check size={15} aria-hidden="true" />}
              {directions[value]}
            </Button>
          ))}
        </div>
      </fieldset>
      <figure className="roll-table" aria-label="띠별로 종이 울리는 시각">
        <figcaption>첫 구멍부터 지난 시간 (초)</figcaption>
        <div className="roll-ruler" aria-hidden="true">
          <span />
          {seconds.map((second) => (
            <span key={second}>{second}</span>
          ))}
        </div>
        <ul aria-live="polite" aria-atomic="true">
          {musicRoll.rolls.map(({ id, holes }) => {
            const times = playbackTimes(holes, direction);
            return (
              <li key={id}>
                <span className="roll-id">
                  {id}
                  <span className="sr-only"> 띠</span>
                </span>
                <span className="roll-strip" aria-hidden="true">
                  {seconds.map((second) => (
                    <span key={second} data-hole={times.includes(second) || undefined} />
                  ))}
                </span>
                <span className="sr-only">{times.map((second) => second + '초').join(', ')}</span>
              </li>
            );
          })}
        </ul>
      </figure>
      <p className="roll-record-reference">
        녹음 속 종소리 <strong>{recordedTimes}</strong>
      </p>
    </section>
  );
}
