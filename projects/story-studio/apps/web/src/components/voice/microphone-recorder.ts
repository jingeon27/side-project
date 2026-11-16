import { trackStudioEvent } from '../../lib/analytics';
import { recordingFile } from './recording-audio';

type TSnapshot =
  | { phase: 'idle'; error?: string }
  | { phase: 'requesting' }
  | { phase: 'recording'; seconds: number }
  | { phase: 'processing' };

export class MicrophoneRecorder {
  private snapshot: TSnapshot = { phase: 'idle' };
  private listeners = new Set<() => void>();
  private session?: AbortController;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: TSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  private release() {
    clearInterval(this.timer);
    clearTimeout(this.deadline);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
  }
  stop = () => {
    if (this.recorder?.state !== 'recording') return;
    this.publish({ phase: 'processing' });
    this.recorder.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    clearInterval(this.timer);
    clearTimeout(this.deadline);
  };
  cancel = () => {
    this.session?.abort();
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.release();
    this.publish({ phase: 'idle' });
  };
  async start(): Promise<File | undefined> {
    if (this.snapshot.phase !== 'idle') return;
    const session = new AbortController();
    this.session = session;
    this.publish({ phase: 'requesting' });
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined' ||
        typeof OfflineAudioContext === 'undefined'
      )
        throw new Error('이 브라우저에서는 직접 녹음을 지원하지 않습니다. 녹음 파일을 선택해 주세요.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      if (session.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
      this.recorder = recorder;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const chunks: Blob[] = [];
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener(
          'error',
          () => reject(new Error('마이크 녹음이 중단되었습니다. 다시 시도해 주세요.')),
          { once: true },
        );
        recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType })), {
          once: true,
        });
        session.signal.addEventListener(
          'abort',
          () => reject(new DOMException('녹음을 취소했습니다.', 'AbortError')),
          { once: true },
        );
        const started = performance.now();
        recorder.start();
        this.publish({ phase: 'recording', seconds: 0 });
        void trackStudioEvent('studio_recording_started', { source: 'microphone' });
        this.timer = setInterval(() => {
          const seconds = Math.min(30, Math.floor((performance.now() - started) / 1000));
          if (this.snapshot.phase !== 'recording' || this.snapshot.seconds === seconds) return;
          this.publish({ phase: 'recording', seconds });
        }, 250);
        this.deadline = setTimeout(this.stop, 30_000);
      });
      if (session.signal.aborted) return;
      this.release();
      this.publish({ phase: 'processing' });
      const file = await recordingFile(blob);
      if (session.signal.aborted) return;
      this.publish({ phase: 'idle' });
      return file;
    } catch (error) {
      if (session.signal.aborted) return;
      this.publish({ phase: 'idle', error: microphoneError(error) });
      return;
    } finally {
      if (this.session === session) {
        this.release();
        this.session = undefined;
      }
    }
  }
}
function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (['NotAllowedError', 'SecurityError'].includes(error.name))
      return '마이크 사용이 허용되지 않았습니다. 브라우저의 사이트 설정에서 마이크를 허용한 뒤 다시 눌러 주세요.';
    if (error.name === 'NotFoundError')
      return '연결된 마이크를 찾지 못했습니다. 마이크 연결을 확인해 주세요.';
    if (error.name === 'NotReadableError')
      return '마이크를 열지 못했습니다. 다른 앱에서 사용 중인지 확인해 주세요.';
    if (['EncodingError', 'NotSupportedError', 'DataError'].includes(error.name))
      return '이 브라우저에서 녹음한 소리를 변환하지 못했습니다. 다시 녹음하거나 음성 파일을 선택해 주세요.';
    return '마이크 녹음에 실패했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
  }
  return error instanceof Error ? error.message : '녹음을 시작하지 못했습니다. 다시 시도해 주세요.';
}
