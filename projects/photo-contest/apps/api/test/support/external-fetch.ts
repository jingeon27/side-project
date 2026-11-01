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
