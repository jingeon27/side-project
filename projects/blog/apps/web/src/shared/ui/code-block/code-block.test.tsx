import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { labels } from '@/shared/config/labels';

import { CodeBlock } from '@/shared/ui/code-block/code-block';

import { NextIntlClientProvider } from 'next-intl';

describe('article reading aids', () => {
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
