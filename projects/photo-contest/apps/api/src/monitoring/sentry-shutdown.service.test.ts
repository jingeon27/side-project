import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

it('SIGTERM 종료 훅에서 기록한 마지막 메트릭을 전송한 뒤 종료해야 한다', async () => {
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
    class LastMetric {
      onModuleDestroy() {
        Sentry.metrics.count('api.http.requests', 1, { attributes: {"http.route":"/graphql"} });
        process.stdout.write('recorded\\n');
      }
    }
    class ShutdownFixture {}
    Module({ providers: [LastMetric, SentryShutdownService] })(ShutdownFixture);
    const app = await NestFactory.createApplicationContext(ShutdownFixture, { logger: false });
    app.enableShutdownHooks(['SIGTERM']);
    process.stdout.write('ready\\n');
    setInterval(() => {}, 1000);
  `;
  const output = await new Promise<{ signal: NodeJS.Signals | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        env: { ...process.env, SENTRY_DSN: '', ENVIRONMENT: 'test' },
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
  expect(output.stderr).toBe('');
  expect(output.signal).toBe('SIGTERM');
  expect(output.stdout).toContain('recorded');
  expect(output.stdout).toContain('sent:');
  expect(output.stdout).toContain('api.http.requests');
  expect(output.stdout.indexOf('recorded')).toBeLessThan(output.stdout.indexOf('sent:'));
}, 10_000);
