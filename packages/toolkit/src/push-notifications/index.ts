import { attemptAsync, clamp } from 'es-toolkit';
import { match, P } from 'ts-pattern';

export const EXPO_PUSH_TOKEN_PATTERN = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{16,200}\]$/;
export const PUSH_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;

export interface IPushMessage {
  to: string;
  title: string;
  body: string;
  data: { path: string; notificationId: string };
  badge: number;
  sound: 'default';
  channelId: string;
}
export type TPushTicket = { status: 'ok'; id: string } | { status: 'error'; code: string };
export type TPushReceipt = { status: 'ok' } | { status: 'error'; code: string };

interface ITransportOptions {
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
}

export class PushProviderError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(`Expo push request failed (${status}).`);
    this.name = 'PushProviderError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function failure(row: Record<string, unknown>): { status: 'error'; code: string } {
  const code = object(row.details)?.error;
  return { status: 'error', code: typeof code === 'string' ? code : 'UnknownError' };
}

/** 앱별 인증·DB와 분리한 Expo HTTP 경계. 응답·오류에 토큰이나 메시지 원문을 싣지 않는다. */
export class ExpoPushTransport {
  constructor(private readonly options: ITransportOptions = {}) {}

  private async request(endpoint: 'send' | 'getReceipts', payload: unknown): Promise<unknown> {
    const [error, response] = await attemptAsync(() =>
      (this.options.fetch ?? globalThis.fetch)(`https://exp.host/--/api/v2/push/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.options.accessToken ? { Authorization: `Bearer ${this.options.accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    );
    if (error !== null || !response) throw new PushProviderError(503, true);
    if (!response.ok) {
      const seconds = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(seconds) ? clamp(seconds * 1000, 0, 60_000) : 0;
      throw new PushProviderError(response.status, response.status === 429 || response.status >= 500, delay);
    }
    try {
      return await response.json();
    } catch {
      throw new PushProviderError(502, true);
    }
  }

  async send(messages: IPushMessage[]): Promise<TPushTicket[]> {
    if (!messages.length) return [];
    if (messages.length > PUSH_BATCH_SIZE) throw new RangeError('Expo push batch is too large.');
    const rows = object(await this.request('send', messages))?.data;
    if (!Array.isArray(rows) || rows.length !== messages.length) throw new PushProviderError(502, true);
    return rows.map((value) => {
      const row = object(value);
      return match(row)
        .with({ status: 'ok', id: P.string.minLength(1) }, ({ id }) => ({ status: 'ok', id }) as const)
        .with({ status: 'error' }, failure)
        .otherwise(() => {
          throw new PushProviderError(502, true);
        });
    });
  }

  async receipts(ids: string[]): Promise<Record<string, TPushReceipt>> {
    if (!ids.length) return {};
    if (ids.length > PUSH_BATCH_SIZE) throw new RangeError('Expo receipt batch is too large.');
    const data = object(object(await this.request('getReceipts', { ids }))?.data);
    if (!data) throw new PushProviderError(502, true);
    const entries = ids.flatMap((id) => {
      const receipt = match(object(data[id]))
        // 아직 준비되지 않은 영수증은 다음 주기에 조회한다.
        .with(null, () => null)
        .with({ status: 'ok' }, () => ({ status: 'ok' }) as const)
        .with({ status: 'error' }, failure)
        .otherwise(() => {
          throw new PushProviderError(502, true);
        });
      return receipt ? [[id, receipt] as const] : [];
    });
    return Object.fromEntries(entries);
  }
}
export { PushDispatcher } from './dispatcher';
export type { IPushJob, IPushJobUpdate, IPushStore } from './dispatcher';
