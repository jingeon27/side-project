export class StorageUploadError extends Error {}

const MIN_UPLOAD_TIMEOUT_MS = 60_000;
const MAX_UPLOAD_TIMEOUT_MS = 15 * 60_000;

/**
 * 티켓이 만료되면 완료가 거절되므로 그때까지만 기다린다. 기기 시계가 서버와 어긋나도 1분~15분 안에서 끊는다.
 */
export function getUploadTimeoutMs(expiresAt: string, now = Date.now()) {
  const remaining = Date.parse(expiresAt) - now;
  if (Number.isNaN(remaining)) return MAX_UPLOAD_TIMEOUT_MS;
  return Math.min(Math.max(remaining, MIN_UPLOAD_TIMEOUT_MS), MAX_UPLOAD_TIMEOUT_MS);
}

/**
 * 서명된 POST 정책으로 저장소에 직접 올린다. `signal`이 끊기면(시트를 닫음) 전송을 멈추고 그 이유를 그대로 던진다.
 * 네트워크 실패·거절·시간 초과는 폼에 보여 줄 StorageUploadError로 바꾼다.
 */
export async function uploadToStorage(
  ticket: { url: string; fields: ReadonlyArray<{ name: string; value: string }>; expiresAt: string },
  file: Blob,
  { signal }: { signal?: AbortSignal } = {},
) {
  const body = new FormData();
  for (const field of ticket.fields) body.append(field.name, field.value);
  // S3 POST는 file 필드가 마지막이어야 하며 multipart 경계는 브라우저가 만든다.
  body.append('file', file);
  // AbortSignal.any·timeout은 구형 WebView에 없어 직접 잇는다.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, getUploadTimeoutMs(ticket.expiresAt));
  signal?.addEventListener('abort', cancel);
  if (signal?.aborted) cancel();
  try {
    const response = await fetch(ticket.url, {
      method: 'POST',
      credentials: 'omit',
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Storage rejected upload');
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted)
      throw new StorageUploadError(
        '파일을 올리는 시간이 너무 오래 걸렸어요. 연결을 확인하고 다시 시도해 주세요.',
      );
    throw new StorageUploadError('파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
