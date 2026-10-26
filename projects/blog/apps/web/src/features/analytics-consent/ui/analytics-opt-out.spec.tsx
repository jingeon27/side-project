import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '@/shared/config/labels';

const text = labels('ko').analytics;
async function renderOptOut() {
  const { AnalyticsOptOut } = await import('./analytics-opt-out');
  return render(<AnalyticsOptOut locale="ko" />);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe('privacy page opt-out control', () => {
  it('renders nothing when the build has no analytics IDs', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    await renderOptOut();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('turns collection off for this browser and back on', async () => {
    const user = userEvent.setup();
    await renderOptOut();
    expect(screen.getByRole('status')).toHaveTextContent(text.on);
    await user.click(screen.getByRole('button', { name: text.disable }));
    expect(localStorage.getItem('blog:analytics-consent')).toBe('denied');
    expect(screen.getByRole('status')).toHaveTextContent(text.off);
    await user.click(screen.getByRole('button', { name: text.enable }));
    expect(localStorage.getItem('blog:analytics-consent')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(text.on);
  });
});
