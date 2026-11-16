'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { match } from 'ts-pattern';

import { trackStudioEvent } from '../../lib/analytics';
import type { MicrophoneRecorder } from './microphone-recorder';

export function VoiceRecorder({
  recorder,
  disabled,
  onRecorded,
}: {
  recorder: MicrophoneRecorder;
  disabled: boolean;
  onRecorded: (file: File) => void;
}) {
  const snapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
  const recorderRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      window.addEventListener('pagehide', recorder.cancel);
      return () => {
        window.removeEventListener('pagehide', recorder.cancel);
        recorder.cancel();
      };
    },
    [recorder],
  );
  const handleStart = async () => {
    void trackStudioEvent('studio_recording_clicked', { action: 'start' });
    const file = await recorder.start();
    if (!file) return;
    onRecorded(file);
    void trackStudioEvent('studio_recording_completed', { source: 'microphone' });
  };
  return (
    <section ref={recorderRef} className="voice-recorder" aria-label="마이크로 녹음">
      <div className="voice-section-heading">
        <h2>직접 녹음</h2>
        <span>최대 30초</span>
      </div>
      <p>조용한 곳에서 한 문장씩 읽어 주세요. 녹음을 마치면 들어보고 대본을 입력할 수 있어요.</p>
      {match(snapshot)
        .with({ phase: 'idle' }, (state) => (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={() => void handleStart()}
            >
              마이크로 녹음 시작
            </button>
            {state.error && <p role="alert">{state.error}</p>}
          </>
        ))
        .with({ phase: 'requesting' }, () => <p role="status">브라우저에서 마이크 사용을 허용해 주세요</p>)
        .with({ phase: 'recording' }, () => <p>녹음 중입니다. 다 읽으면 아래의 녹음 마치기를 눌러 주세요.</p>)
        .with({ phase: 'processing' }, () => <p role="status">녹음한 소리를 준비하는 중</p>)
        .exhaustive()}
    </section>
  );
}

export function RecordingControls({ recorder }: { recorder: MicrophoneRecorder }) {
  const snapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
  const handleStop = () => {
    void trackStudioEvent('studio_recording_clicked', { action: 'stop' });
    recorder.stop();
  };
  const handleCancel = () => {
    void trackStudioEvent('studio_recording_clicked', { action: 'cancel' });
    recorder.cancel();
  };
  return match(snapshot)
    .with({ phase: 'idle' }, () => null)
    .with({ phase: 'requesting' }, { phase: 'processing' }, () => (
      <>
        <span>녹음을 준비하는 중</span>
        <button type="button" className="button secondary" onClick={handleCancel}>
          녹음 취소
        </button>
      </>
    ))
    .with({ phase: 'recording' }, (state) => (
      <>
        <span className="recording-clock" role="timer" aria-label="녹음 시간">
          녹음 중 {state.seconds}초 / 30초
        </span>
        <button type="button" className="button secondary" onClick={handleCancel}>
          녹음 취소
        </button>
        <button type="button" className="button primary" onClick={handleStop}>
          녹음 마치기
        </button>
      </>
    ))
    .exhaustive();
}
