import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { labels } from '@/shared/config/labels';
import { CodeBlock } from '@/shared/ui/code-block/code-block';

describe('article reading aids', () => {
  it('restarts copy feedback after another copy and clears its timer on unmount', async () => {
    userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    vi.useFakeTimers();
    try {
      const view = render(
        <NextIntlClientProvider locale="ko" messages={{}}>
          <CodeBlock>
            <code>const answer = 42;</code>
          </CodeBlock>
        </NextIntlClientProvider>,
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: labels('ko').article.copyCode }));
      });
      act(() => vi.advanceTimersByTime(1500));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: labels('ko').article.copied }));
      });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole('status')).toHaveTextContent(labels('ko').article.copied);
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies a highlighted multi-line block as readable original code', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="ko" messages={{}}>
        <CodeBlock data-language="typescript">
          <code>
            <span data-line="">
              <span>const</span>
              {' answer = 42;'}
            </span>
            {'\n'}
            <span data-line="">console.log(answer);</span>
          </code>
        </CodeBlock>
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: labels('ko').article.copyCode }));
    expect(await navigator.clipboard.readText()).toBe('const answer = 42;\nconsole.log(answer);\n');
    expect(screen.getByRole('status')).toHaveTextContent(labels('ko').article.copied);
  });
});
