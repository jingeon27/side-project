import { rm } from 'node:fs/promises';

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/** The normal failure reporter can print message locators, response bodies and URL identifiers. */
export default class ChatBenchmarkReporter implements Reporter {
  private readonly artifactsToRemove = new Set<string>();

  printsToStdio() {
    return true;
  }

  onBegin(_config: FullConfig, suite: Suite) {
    process.stdout.write(`Chat benchmark tests: ${suite.allTests().length}\n`);
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    // Playwright can create error-context.md even with trace/screenshot/video disabled.
    for (const attachment of result.attachments) {
      if (attachment.name === 'chat-delivery.json' && attachment.contentType === 'application/json') continue;
      if (attachment.path) this.artifactsToRemove.add(attachment.path);
    }
    process.stdout.write(`Chat delivery benchmark: ${result.status}\n`);
  }

  onError() {
    process.stderr.write('Chat delivery benchmark harness failed; raw diagnostics are suppressed.\n');
  }

  async onEnd(result: FullResult) {
    try {
      await Promise.all([...this.artifactsToRemove].map((path) => rm(path, { force: true })));
    } catch {
      process.stderr.write(
        'Benchmark artifact cleanup failed; remove the output directory before sharing.\n',
      );
      return { status: 'failed' as const };
    }
    process.stdout.write(
      `Benchmark run: ${result.status}. Sanitized JSON: .e2e-build/chat-benchmark-results/\n`,
    );
  }
}
