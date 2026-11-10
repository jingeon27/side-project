/** 서버는 파일을 열지 않으므로 동영상 길이와 크기는 올리기 전에 브라우저에서만 확인한다. */
export const MAX_VIDEO_SECONDS = 5 * 60;
const READ_TIMEOUT_MS = 5_000;

interface IVideoMetadata {
  /** 길이(초) */
  seconds: number | null;
  /** 게시물 화면 틀의 비율에 쓰는 가로·세로 */
  size: { width: number; height: number } | null;
}

const UNKNOWN: IVideoMetadata = { seconds: null, size: null };

/**
 * 브라우저가 메타데이터에서 읽은 동영상 길이와 크기. 이 기기에서 열 수 없거나 알 수 없는 값은 null이며,
 * 다른 기기에서는 재생될 수 있으므로 막지 않는다.
 */
export function readVideoMetadata(
  file: Blob,
  createVideo: () => HTMLVideoElement = () => document.createElement('video'),
): Promise<IVideoMetadata> {
  if (typeof URL.createObjectURL !== 'function') return Promise.resolve(UNKNOWN);
  return new Promise((resolve) => {
    const video = createVideo();
    const source = URL.createObjectURL(file);
    const finish = (metadata: IVideoMetadata) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      URL.revokeObjectURL(source);
      resolve(metadata);
    };
    const timer = setTimeout(() => finish(UNKNOWN), READ_TIMEOUT_MS);
    video.addEventListener('loadedmetadata', () =>
      finish({
        seconds: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
        size:
          video.videoWidth > 0 && video.videoHeight > 0
            ? { width: video.videoWidth, height: video.videoHeight }
            : null,
      }),
    );
    video.addEventListener('error', () => finish(UNKNOWN));
    video.preload = 'metadata';
    video.src = source;
  });
}

export function isTooLongVideo(seconds: number | null) {
  return seconds !== null && seconds > MAX_VIDEO_SECONDS;
}
