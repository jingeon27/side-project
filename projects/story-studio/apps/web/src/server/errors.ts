export class StudioError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof StudioError ? error.message : '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    },
    {
      status: error instanceof StudioError ? error.status : 500,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

// The studio is a local app; never expose a paid, unauthenticated provider proxy on a network interface.
export function requireLocalRequest(request: Request, mutation = false) {
  const url = new URL(request.url);
  // Next can normalize the internal request URL to localhost while preserving the browser's Host.
  // Validate the actual HTTP authority, never forwarded headers, for both local access and CSRF.
  const authority = request.headers.get('host') || url.host;
  const browserUrl = new URL(`${url.protocol}//${authority}`);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(browserUrl.hostname) || browserUrl.host !== authority) {
    throw new StudioError('이 스튜디오는 이 컴퓨터에서만 사용할 수 있습니다.', 403);
  }
  if (mutation && request.headers.get('origin') !== browserUrl.origin) {
    throw new StudioError('스튜디오 화면에서 다시 요청해 주세요.', 403);
  }
}
export async function readBody(request: Request, limit = 1_500_000) {
  const reader = request.body?.getReader();
  if (!reader) throw new StudioError('입력한 내용을 확인해 주세요.', 400);
  const chunks: Uint8Array[] = [];
  async function readNext(bytes: number): Promise<ReturnType<typeof Buffer.concat>> {
    const next = await reader?.read();
    if (!next || next.done) return Buffer.concat(chunks, bytes);
    const total = bytes + next.value.byteLength;
    if (total > limit) throw new StudioError('요청이 너무 큽니다. 파일이나 작품을 나누어 주세요.', 413);
    chunks.push(next.value);
    return readNext(total);
  }
  try {
    return await readNext(0);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new StudioError('JSON 형식의 요청이 필요합니다.', 415);
  try {
    return JSON.parse((await readBody(request)).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError('입력한 내용을 확인해 주세요.', 400);
  }
}
