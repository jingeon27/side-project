import { afterEach, describe, expect, it, vi } from 'vitest';

import { isTooLongVideo, MAX_VIDEO_SECONDS, readVideoMetadata } from './video-metadata.helper';

class FakeVideo extends EventTarget {
  duration = Number.NaN;
  videoWidth = 0;
  videoHeight = 0;
  preload = '';
  src = '';
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function stubObjectUrl() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
  return vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

describe('readVideoMetadata', () => {
  it('메타데이터의 길이와 크기를 읽고 임시 주소를 정리해야 한다', async () => {
    const revoke = stubObjectUrl();
    const video = new FakeVideo();
    const reading = readVideoMetadata(new Blob(['clip']), () => video as unknown as HTMLVideoElement);
    expect(video.src).toBe('blob:video');
    video.duration = MAX_VIDEO_SECONDS + 1;
    video.videoWidth = 1080;
    video.videoHeight = 1920;
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(await reading).toEqual({
      seconds: MAX_VIDEO_SECONDS + 1,
      size: { width: 1080, height: 1920 },
    });
    expect(isTooLongVideo((await reading).seconds)).toBe(true);
    expect(video.src).toBe('');
    expect(revoke).toHaveBeenCalledWith('blob:video');
  });

  it('열 수 없거나 길이·크기를 모르는 동영상은 막지 않도록 null을 돌려줘야 한다', async () => {
    stubObjectUrl();
    const broken = new FakeVideo();
    const failed = readVideoMetadata(new Blob(['clip']), () => broken as unknown as HTMLVideoElement);
    broken.dispatchEvent(new Event('error'));
    expect(await failed).toEqual({ seconds: null, size: null });

    const live = new FakeVideo();
    const unknown = readVideoMetadata(new Blob(['clip']), () => live as unknown as HTMLVideoElement);
    live.duration = Number.POSITIVE_INFINITY;
    live.dispatchEvent(new Event('loadedmetadata'));
    expect(await unknown).toEqual({ seconds: null, size: null });
    expect(isTooLongVideo(null)).toBe(false);
    expect(isTooLongVideo(MAX_VIDEO_SECONDS)).toBe(false);
  });

  it('메타데이터가 오지 않으면 시간 제한 뒤 null이어야 한다', async () => {
    stubObjectUrl();
    vi.useFakeTimers();
    const reading = readVideoMetadata(
      new Blob(['clip']),
      () => new FakeVideo() as unknown as HTMLVideoElement,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await reading).toEqual({ seconds: null, size: null });
  });
});
