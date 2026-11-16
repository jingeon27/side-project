import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

async function shutdownFixture(fixture: string) {
  const moduleUrl = new URL('./sentry-shutdown.service.ts', import.meta.url).href;
  const script = `
    import { createRequire } from 'node:module';
    import { fileURLToPath } from 'node:url';
    const require = createRequire(${JSON.stringify(moduleUrl)});
    require('reflect-metadata');
    const { Module } = require('@nestjs/common');
    const { NestFactory } = require('@nestjs/core');
    const Sentry = require('@sentry/node');
    const { SentryShutdownService } = require(fileURLToPath(${JSON.stringify(moduleUrl)}));
    const serviceUrl = ${JSON.stringify(moduleUrl)};
    const deliveries = [];
    Sentry.init({
      dsn: 'https://shutdown@sentry.invalid/1',
      defaultIntegrations: false,
      _flushInterval: 0,
      transport: () => ({
        send: (envelope) => {
          const delivery = new Promise((resolve) => setTimeout(() => {
            process.stdout.write('sent:' + JSON.stringify(envelope) + '\\n');
            resolve({ statusCode: 200 });
          }, 20));
          deliveries.push(delivery);
          return delivery;
        },
        flush: async () => {
          await Promise.all(deliveries);
          return true;
        },
      }),
    });
    ${fixture}
    const app = await NestFactory.createApplicationContext(ShutdownFixture, { logger: false });
    app.enableShutdownHooks(['SIGTERM']);
    process.stdout.write('ready\\n');
    setInterval(() => {}, 1000);
  `;
  const output = await new Promise<{ signal: NodeJS.Signals | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        env: { ...process.env, SENTRY_DSN: 'https://shutdown@sentry.invalid/1', ENVIRONMENT: 'test' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout: string[] = [];
      const stderr: string[] = [];
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Shutdown fixture did not exit.'));
      }, 8000);
      child.stdout.on('data', (data: Buffer) => {
        stdout.push(data.toString());
        if (!child.killed && stdout.join('').includes('ready')) child.kill('SIGTERM');
      });
      child.stderr.on('data', (data: Buffer) => stderr.push(data.toString()));
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (_code, signal) => {
        clearTimeout(timeout);
        resolve({ signal, stdout: stdout.join(''), stderr: stderr.join('') });
      });
    },
  );
  return output;
}

it('SIGTERM 종료 훅에서 기록한 마지막 메트릭을 전송한 뒤 종료해야 한다', async () => {
  const output = await shutdownFixture(`
    class LastMetric {
      onModuleDestroy() {
        Sentry.metrics.count('chat.sse.closed', 1, { attributes: {reason:'server_shutdown'} });
        process.stdout.write('recorded\\n');
      }
    }
    class ShutdownFixture {}
    Module({ providers: [LastMetric, SentryShutdownService] })(ShutdownFixture);
  `);
  expect(output.stderr).toBe('');
  expect(output.signal).toBe('SIGTERM');
  expect(output.stdout).toContain('recorded');
  expect(output.stdout).toContain('sent:');
  expect(output.stdout).toContain('chat.sse.closed');
  expect(output.stdout.indexOf('recorded')).toBeLessThan(output.stdout.indexOf('sent:'));
}, 10_000);

it('진행 중인 실제 캐시 재시도의 종료 실패도 Sentry flush 전에 정리해야 한다', async () => {
  const output = await shutdownFixture(`
    const { CacheInvalidationModule } = require(fileURLToPath(new URL('../cache-invalidation/cache-invalidation.module.ts', serviceUrl)));
    const { DatabaseModule } = require(fileURLToPath(new URL('../database/database.module.ts', serviceUrl)));
    const request = { reject: () => {} };
    globalThis.fetch = () => new Promise((_resolve, reject) => { request.reject = reject; });
    const db = {
      cacheInvalidation: {
        findMany: async () => [{ tag:'posts', revision:'shutdown-revision' }],
        deleteMany: async () => ({ count:1 }),
      },
    };
    const config = { cacheRevalidation: { url:'https://cache.invalid', secret:'test-cache-secret' } };
    class FinishCacheRequest {
      onModuleDestroy() {
        setTimeout(() => {
          process.stdout.write('cache-failed\\n');
          request.reject(new Error('private-cache-response'));
        }, 40);
      }
    }
    class ShutdownFixture {}
    Module({
      imports:[DatabaseModule.register(config,db), CacheInvalidationModule],
      providers:[FinishCacheRequest, SentryShutdownService],
    })(ShutdownFixture);
  `);
  expect(output.stderr).toBe('');
  expect(output.signal).toBe('SIGTERM');
  expect(output.stdout).toContain('cache-failed');
  expect(output.stdout).toContain('sent:');
  expect(output.stdout).toContain('cache-invalidation');
  expect(output.stdout).not.toContain('private-cache-response');
  expect(output.stdout.indexOf('cache-failed')).toBeLessThan(output.stdout.indexOf('sent:'));
}, 10_000);
