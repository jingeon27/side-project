import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '@/shared/config/labels';

const text = labels('ko');
const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
function useTimeZone(timeZone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...resolvedOptions.call(this), timeZone };
  });
}
async function renderConsent() {
  const { AnalyticsConsent } = await import('./analytics-consent');
  return render(<AnalyticsConsent locale="ko" />);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  useTimeZone('Asia/Seoul');
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Korea-only analytics notice', () => {
  it('renders neither the notice nor the settings button outside the Korean time zone', async () => {
    useTimeZone('Europe/Paris');
    await renderConsent();
    expect(screen.queryByRole('button', { name: text.analytics.preferences })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows visit statistics as already on and links to the privacy notice before any choice', async () => {
    await renderConsent();
    const notice = screen.getByRole('complementary', { name: text.analytics.title });
    expect(within(notice).getByRole('link', { name: text.privacy.title })).toHaveAttribute(
      'href',
      '/ko/privacy',
    );
    expect(within(notice).getByRole('button', { name: text.analytics.statistics })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(notice).getByRole('button', { name: text.analytics.allow })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('stores the choice, hides the notice and reopens it from the settings button', async () => {
    const user = userEvent.setup();
    await renderConsent();
    await user.click(screen.getByRole('button', { name: text.analytics.deny }));
    expect(localStorage.getItem('blog:analytics-consent')).toBe('denied');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: text.analytics.preferences }));
    expect(screen.getByRole('button', { name: text.analytics.deny })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes without a choice and keeps visit statistics on', async () => {
    const user = userEvent.setup();
    await renderConsent();
    await user.click(screen.getByRole('button', { name: text.analytics.close }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(localStorage.getItem('blog:analytics-consent')).toBeNull();
  });
});
