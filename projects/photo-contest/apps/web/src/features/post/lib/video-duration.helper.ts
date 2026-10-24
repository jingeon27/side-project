/** 서버는 파일을 열지 않으므로 동영상 길이는 올리기 전에 브라우저에서만 확인한다. */
export const MAX_VIDEO_SECONDS = 5 * 60;
const READ_TIMEOUT_MS = 5_000;

/**
 * 브라우저가 메타데이터에서 읽은 동영상 길이(초). 이 기기에서 열 수 없거나 길이를 알 수 없으면 null이며,
 * 다른 기기에서는 재생될 수 있으므로 막지 않는다.
 */
export function readVideoDuration(
  file: Blob,
  createVideo: () => HTMLVideoElement = () => document.createElement('video'),
): Promise<number | null> {
  if (typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = createVideo();
    const source = URL.createObjectURL(file);
    const finish = (seconds: number | null) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      URL.revokeObjectURL(source);
      resolve(seconds);
    };
    const timer = setTimeout(() => finish(null), READ_TIMEOUT_MS);
    video.addEventListener('loadedmetadata', () =>
      finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null),
    );
    video.addEventListener('error', () => finish(null));
    video.preload = 'metadata';
    video.src = source;
  });
}

export function isTooLongVideo(seconds: number | null) {
  return seconds !== null && seconds > MAX_VIDEO_SECONDS;
}
