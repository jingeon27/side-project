import { throwIfClosed } from '../model/form';

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
  const handleAbort = () => controller.abort();
  const timer = setTimeout(handleAbort, getUploadTimeoutMs(ticket.expiresAt));
  signal?.addEventListener('abort', handleAbort);
  if (signal?.aborted) handleAbort();
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
    signal?.removeEventListener('abort', handleAbort);
  }
}

interface IUploadTicket {
  id: string;
  url: string;
  fields: ReadonlyArray<{ name: string; value: string }>;
  expiresAt: string;
}

interface IUploadWithTicketOptions {
  /** 업로드 티켓 mutation. 받은 티켓을 돌려준다. */
  request: () => Promise<IUploadTicket | undefined>;
  /** 완료 확인 mutation. 완료된 업로드의 id를 돌려준다. */
  complete: (uploadId: string) => Promise<string | undefined>;
  /** 시트가 닫히면 다음 단계를 시작하지 않고 전송을 끊는다. */
  signal?: AbortSignal;
}

/**
 * 티켓 발급 → 저장소 직접 전송 → 완료 확인을 차례로 하고 완료된 업로드 id를 돌려준다.
 * 응답에 값이 없으면 저장 단계로 넘어가지 않도록 던진다(GraphQL 오류는 ErrorLink가 이미 알렸다).
 */
export async function uploadWithTicket(
  file: Blob,
  { request, complete, signal }: IUploadWithTicketOptions,
): Promise<string> {
  const ticket = await request();
  if (!ticket) throw new Error('업로드 티켓을 받지 못했습니다.');
  if (signal) throwIfClosed(signal);
  await uploadToStorage(ticket, file, { signal });
  if (signal) throwIfClosed(signal);
  const uploadId = await complete(ticket.id);
  if (!uploadId) throw new Error('업로드를 완료하지 못했습니다.');
  return uploadId;
}
