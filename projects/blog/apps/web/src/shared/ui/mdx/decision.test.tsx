import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { Decision } from './decision';

describe('localized decision notes', () => {
  it.each([
    { locale: 'en', messages: en, title: 'Why I chose this' },
    { locale: 'ko', messages: ko, title: '선택의 이유' },
  ])('uses the $locale article language', ({ locale, messages, title }) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Decision>Reason for the decision</Decision>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(title, { exact: true })).toBeVisible();
  });

  it('keeps a title supplied by the article', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Decision title="Why this API">Reason for the decision</Decision>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Why this API')).toBeVisible();
    expect(screen.queryByText('Why I chose this', { exact: true })).not.toBeInTheDocument();
  });
});
