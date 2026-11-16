import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MicrophoneRecorder } from './microphone-recorder';

const conversion = vi.hoisted(() => ({ file: vi.fn() }));
vi.mock('./recording-audio', () => ({ recordingFile: conversion.file }));
const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = () => true;
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  constructor(readonly stream: MediaStream) {
    super();
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob(['recorded']) }));
    this.dispatchEvent(new Event('stop'));
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.instances = [];
  track.stop.mockReset();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('OfflineAudioContext', class {});
  conversion.file.mockReset().mockResolvedValue(new File(['wav'], '녹음.wav', { type: 'audio/wav' }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('30초에 자동으로 녹음을 마치고 트랙과 타이머를 해제한다', async () => {
  const recorder = new MicrophoneRecorder();
  const result = recorder.start();
  await Promise.resolve();
  expect(recorder.getSnapshot().phase).toBe('recording');
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await result)?.type).toBe('audio/wav');
  expect(track.stop).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(recorder.getSnapshot()).toEqual({ phase: 'idle' });
});
it('녹음을 취소하면 파일을 추가하지 않고 마이크를 즉시 닫는다', async () => {
  const recorder = new MicrophoneRecorder();
  const result = recorder.start();
  await Promise.resolve();
  recorder.cancel();
  expect(await result).toBeUndefined();
  expect(conversion.file).not.toHaveBeenCalled();
  expect(track.stop).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('권한 대기 중 화면을 떠난 뒤 늦게 열린 마이크도 닫고 새 녹음을 방해하지 않는다', async () => {
  const permission = Promise.withResolvers<MediaStream>();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockReturnValueOnce(permission.promise).mockResolvedValue(stream) },
  });
  const recorder = new MicrophoneRecorder();
  const first = recorder.start();
  recorder.cancel();
  const second = recorder.start();
  await Promise.resolve();
  const oldTrack = { stop: vi.fn() };
  permission.resolve({ getTracks: () => [oldTrack] } as unknown as MediaStream);
  await first;
  expect(oldTrack.stop).toHaveBeenCalledOnce();
  expect(recorder.getSnapshot().phase).toBe('recording');
  recorder.stop();
  expect(await second).toBeDefined();
});
it('거부된 마이크 권한을 한국어로 안내하고 다시 시도할 수 있다', async () => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi
        .fn()
        .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
        .mockResolvedValue(stream),
    },
  });
  const recorder = new MicrophoneRecorder();
  expect(await recorder.start()).toBeUndefined();
  expect(recorder.getSnapshot()).toMatchObject({
    phase: 'idle',
    error: expect.stringContaining('사이트 설정'),
  });
  const retry = recorder.start();
  await Promise.resolve();
  recorder.stop();
  expect(await retry).toBeDefined();
});
