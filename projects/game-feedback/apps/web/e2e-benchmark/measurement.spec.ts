import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import type { Page, Request } from '@playwright/test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { boundedSetting, percentiles, requestKind, RequestMeasurement } from './measurement';
import ChatBenchmarkReporter from './reporter';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('chat benchmark measurement', () => {
  it('uses nearest rank without inventing a distribution for zero samples', () => {
    expect(percentiles([])).toBeNull();
    expect(percentiles([5, 1, 4, 3, 2])).toEqual({ count: 5, p50: 3, p95: 5, p99: 5 });
    expect(percentiles(Array.from({ length: 100 }, (_, index) => index + 1))).toEqual({
      count: 100,
      p50: 50,
      p95: 95,
      p99: 99,
    });
  });

  it('rejects unsafe sample counts and intervals instead of expanding the traffic', () => {
    vi.stubEnv('GF_CHAT_BENCHMARK_SAMPLES', '21');
    expect(() => boundedSetting('GF_CHAT_BENCHMARK_SAMPLES', 5, 1, 20)).toThrow();
    vi.stubEnv('GF_CHAT_BENCHMARK_INTERVAL_MS', '100');
    expect(() => boundedSetting('GF_CHAT_BENCHMARK_INTERVAL_MS', 5000, 5000, 15000)).toThrow();
    vi.stubEnv('GF_CHAT_BENCHMARK_SAMPLES', '5');
    expect(boundedSetting('GF_CHAT_BENCHMARK_SAMPLES', 5, 1, 20)).toBe(5);
  });

  it('distinguishes receiver reads, read receipts and streaming requests', () => {
    expect(requestKind('GET', '/api/conversations/private-id/messages')).toBe('messageReads');
    expect(requestKind('GET', '/api/conversations')).toBe('conversationReads');
    expect(requestKind('GET', '/api/notifications')).toBe('notificationReads');
    expect(requestKind('GET', '/api/session')).toBe('sessionReads');
    expect(requestKind('POST', '/api/conversations/private-id/read')).toBe('readReceipts');
    expect(requestKind('GET', '/api/chat/events')).toBe('sseConnections');
    expect(requestKind('POST', '/api/conversations/private-id/messages')).toBe('otherRestWrites');
  });

  it('counts only request starts in the window and keeps a pre-existing SSE separate', () => {
    const page = new EventEmitter();
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1);
    const measurement = new RequestMeasurement(page as unknown as Page, 'http://127.0.0.1:3301');
    const stream = {
      url: () => 'http://127.0.0.1:3301/api/chat/events',
      method: () => 'GET',
    } as Request;
    page.emit('request', stream);
    page.emit('response', {
      request: () => stream,
      url: stream.url,
      status: () => 200,
      headers: () => ({ 'content-type': 'text/event-stream' }),
    });
    clock.mockReturnValue(10);
    const request = {
      url: () => 'http://127.0.0.1:3301/api/conversations/private-canary/messages?cursor=private-canary',
      method: () => 'GET',
    } as Request;
    page.emit('request', request);
    page.emit('request', {
      url: () => 'https://external.invalid/api/notifications',
      method: () => 'GET',
    } as Request);
    clock.mockReturnValue(20);
    page.emit('request', request);
    const window = measurement.window(10, 20);
    expect(window.started.messageReads).toBe(1);
    expect(window.started.notificationReads).toBe(0);
    expect(window.started.sseConnections).toBe(0);
    expect(measurement.activeStreams()).toBe(1);
    expect(JSON.stringify(window)).not.toMatch(/private-canary|cursor|http/);
    page.emit('requestfailed', stream);
    expect(measurement.activeStreams()).toBe(0);
    measurement.dispose();
    expect(page.listenerCount('request')).toBe(0);
    expect(page.listenerCount('response')).toBe(0);
  });

  it('removes failure context artifacts while preserving the sanitized JSON attachment', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const directory = await mkdtemp(join(tmpdir(), 'gf-benchmark-reporter-'));
    const json = join(directory, 'chat-delivery.json');
    const context = join(directory, 'error-context.md');
    try {
      await writeFile(json, '{"samples":[]}');
      await writeFile(context, 'private-message-canary private-url-id cookie=private-value');
      const reporter = new ChatBenchmarkReporter();
      reporter.onTestEnd(
        {} as TestCase,
        {
          status: 'failed',
          attachments: [
            { name: 'chat-delivery.json', contentType: 'application/json', path: json },
            { name: 'error-context', contentType: 'text/markdown', path: context },
          ],
        } as TestResult,
      );
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 });
      await expect(readFile(context, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(json, 'utf8')).toBe('{"samples":[]}');
      expect(process.stdout.write).not.toHaveBeenCalledWith(
        expect.stringMatching(/private-message|private-url|cookie/),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
