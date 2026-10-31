import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { Summary } from './summary';

describe('localized article summaries', () => {
  it.each([
    { locale: 'en', messages: en, title: 'Summary' },
    { locale: 'ko', messages: ko, title: '요약' },
  ])('uses the $locale article language for the default title', ({ locale, messages, title }) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Summary>Article summary content</Summary>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('complementary')).toHaveTextContent(title);
    expect(screen.getByText('Article summary content')).toBeVisible();
  });

  it('preserves an explicit title supplied by the article', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Summary title="At a glance">Article summary content</Summary>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('At a glance')).toBeVisible();
    expect(screen.queryByText('Summary', { exact: true })).not.toBeInTheDocument();
  });
});
