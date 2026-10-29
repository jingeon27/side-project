import { vi } from 'vitest';

type TFetchHandler = (init: RequestInit | undefined) => Response | Promise<Response>;

export interface IExternalCall {
  url: string;
  init: RequestInit | undefined;
}

/**
 * API가 밖으로 보내는 요청(Expo 푸시 등 외부 제공자)만 경계에서 바꾼다. supertest는 fetch를 쓰지 않으므로
 * 테스트 요청과 섞이지 않는다. 등록하지 않은 주소로 나가면 실제 네트워크 대신 실패시킨다.
 * 테스트가 끝나면 setup.ts가 원래 fetch로 되돌린다.
 */
export function stubExternalFetch(routes: Record<string, TFetchHandler>): IExternalCall[] {
  const calls: IExternalCall[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    const handler = routes[url];
    if (!handler) throw new Error(`예상하지 못한 외부 요청: ${url}`);
    return handler(init);
  });
  return calls;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch에 넘긴 x-www-form-urlencoded 본문 */
export function formBody(init: RequestInit | undefined): URLSearchParams {
  const body = init?.body;
  if (body instanceof URLSearchParams) return body;
  return new URLSearchParams(typeof body === 'string' ? body : '');
}

/** fetch에 넘긴 JSON 본문 */
export function jsonBody<TBody>(init: RequestInit | undefined): TBody {
  return JSON.parse(String(init?.body)) as TBody;
}
