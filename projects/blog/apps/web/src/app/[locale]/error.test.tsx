import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';
import ErrorPage from './error';

describe('route error page', () => {
  it.each([
    { locale: 'ko', messages: ko },
    { locale: 'en', messages: en },
  ])('shows the $locale message copy and retries the route', async ({ locale, messages }) => {
    const reset = vi.fn();
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ErrorPage error={new Error('Failed to render')} reset={reset} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: messages.error.title })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: messages.error.retry }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
