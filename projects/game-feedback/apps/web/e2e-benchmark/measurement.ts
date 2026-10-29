import { performance } from 'node:perf_hooks';

import type { Page, Request, Response } from '@playwright/test';
import { countBy } from 'es-toolkit';
import { match, P } from 'ts-pattern';

type TRequestKind =
  | 'messageReads'
  | 'conversationReads'
  | 'notificationReads'
  | 'sessionReads'
  | 'readReceipts'
  | 'otherRestReads'
  | 'otherRestWrites'
  | 'sseConnections';

interface IRequestStart {
  at: number;
  kind: TRequestKind;
}

export interface IRequestWindow {
  durationMs: number;
  started: Record<TRequestKind, number>;
  responsesObserved: { rateLimited: number; serverErrors: number; failed: number };
}

export function boundedSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error('채팅 벤치마크 설정 범위를 확인해주세요.');
  return value;
}

export function percentiles(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const nearestRank = (percentile: number) => sorted[Math.ceil(percentile * sorted.length) - 1];
  return { count: sorted.length, p50: nearestRank(0.5), p95: nearestRank(0.95), p99: nearestRank(0.99) };
}

export function requestKind(method: string, pathname: string): TRequestKind {
  return match({ method, pathname })
    .returnType<TRequestKind>()
    .with({ pathname: '/api/chat/events' }, () => 'sseConnections')
    .with(
      { method: 'GET', pathname: P.string.regex(/^\/api\/conversations\/[^/]+\/messages$/) },
      () => 'messageReads',
    )
    .with({ method: 'GET', pathname: '/api/conversations' }, () => 'conversationReads')
    .with({ method: 'GET', pathname: '/api/notifications' }, () => 'notificationReads')
    .with({ method: 'GET', pathname: '/api/session' }, () => 'sessionReads')
    .with(
      { method: 'POST', pathname: P.string.regex(/^\/api\/conversations\/[^/]+\/read$/) },
      () => 'readReceipts',
    )
    .with({ method: 'GET' }, () => 'otherRestReads')
    .otherwise(() => 'otherRestWrites');
}

/** Records only fixed categories and monotonic timestamps; no URL, payload, identity or headers. */
export class RequestMeasurement {
  private readonly starts: IRequestStart[] = [];
  private readonly outcomes: { at: number; kind: 'rateLimited' | 'serverErrors' | 'failed' }[] = [];
  private readonly streams = new Set<Request>();

  constructor(
    private readonly page: Page,
    private readonly origin: string,
  ) {
    page.on('request', this.handleRequest);
    page.on('response', this.handleResponse);
    page.on('requestfailed', this.handleFailed);
    page.on('requestfinished', this.handleFinished);
  }

  private owned(request: Request) {
    const url = new URL(request.url());
    return url.origin === this.origin && url.pathname.startsWith('/api/');
  }

  private handleRequest = (request: Request) => {
    if (!this.owned(request)) return;
    this.starts.push({
      at: performance.now(),
      kind: requestKind(request.method(), new URL(request.url()).pathname),
    });
  };

  private handleResponse = (response: Response) => {
    const request = response.request();
    if (!this.owned(request)) return;
    if (
      new URL(response.url()).pathname === '/api/chat/events' &&
      response.status() === 200 &&
      response.headers()['content-type']?.startsWith('text/event-stream')
    )
      this.streams.add(request);
    if (response.status() === 429) this.outcomes.push({ at: performance.now(), kind: 'rateLimited' });
    if (response.status() >= 500) this.outcomes.push({ at: performance.now(), kind: 'serverErrors' });
  };

  private handleFailed = (request: Request) => {
    this.streams.delete(request);
    if (this.owned(request)) this.outcomes.push({ at: performance.now(), kind: 'failed' });
  };

  private handleFinished = (request: Request) => {
    this.streams.delete(request);
  };

  activeStreams() {
    return this.streams.size;
  }

  assertHealthy() {
    if (this.activeStreams() !== 1 || this.outcomes.some((item) => item.kind !== 'failed'))
      throw new Error('채팅 벤치마크의 연결 또는 HTTP 상태를 확인해주세요.');
  }

  window(start: number, end: number): IRequestWindow {
    const starts = countBy(
      this.starts.filter((item) => item.at >= start && item.at < end),
      (item) => item.kind,
    );
    const outcomes = countBy(
      this.outcomes.filter((item) => item.at >= start && item.at < end),
      (item) => item.kind,
    );
    return {
      durationMs: end - start,
      started: {
        messageReads: starts.messageReads ?? 0,
        conversationReads: starts.conversationReads ?? 0,
        notificationReads: starts.notificationReads ?? 0,
        sessionReads: starts.sessionReads ?? 0,
        readReceipts: starts.readReceipts ?? 0,
        otherRestReads: starts.otherRestReads ?? 0,
        otherRestWrites: starts.otherRestWrites ?? 0,
        sseConnections: starts.sseConnections ?? 0,
      },
      responsesObserved: {
        rateLimited: outcomes.rateLimited ?? 0,
        serverErrors: outcomes.serverErrors ?? 0,
        failed: outcomes.failed ?? 0,
      },
    };
  }

  dispose() {
    this.page.off('request', this.handleRequest);
    this.page.off('response', this.handleResponse);
    this.page.off('requestfailed', this.handleFailed);
    this.page.off('requestfinished', this.handleFinished);
    this.streams.clear();
  }
}
