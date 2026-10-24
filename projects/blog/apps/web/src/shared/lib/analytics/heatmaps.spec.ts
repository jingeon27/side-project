import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
  vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', 'testproject1');
  localStorage.clear();
  document.querySelector('#blog-clarity')?.remove();
  delete window.clarity;
  delete window.__blogHeatmapsInitialized;
  delete window.__blogHeatmapsStopped;
});
afterEach(() => vi.unstubAllEnvs());

describe('optional behavior analytics', () => {
  it('loads no heatmap SDK without consent and supports Clarity without GA4', async () => {
    const analytics = await import('./events');
    expect(analytics.analyticsConfigured).toBe(true);
    analytics.trackPageView('/ko');
    expect(document.querySelector('#blog-clarity')).toBeNull();
    analytics.setAnalyticsConsent(true);
    analytics.trackPageView('/ko');
    analytics.trackPageView('/ko/about');
    expect(document.querySelectorAll('#blog-clarity')).toHaveLength(1);
    expect(document.querySelector('#blog-clarity')?.getAttribute('src')).toBe(
      'https://www.clarity.ms/tag/testproject1',
    );
    expect(window.clarity?.q).toContainEqual([
      'consentv2',
      { ad_Storage: 'denied', analytics_Storage: 'granted' },
    ]);
    expect(document.querySelector('#blog-google-analytics')).toBeNull();
  });
  it('stops collection on withdrawal and sends only approved event names', async () => {
    const analytics = await import('./events');
    analytics.setAnalyticsConsent(true);
    analytics.initializeAnalytics();
    const clarity = vi.fn();
    window.clarity = clarity;
    analytics.trackEvent('search_performed', { has_query: true, query: 'private' } as { has_query: boolean });
    expect(clarity).toHaveBeenCalledWith('event', 'search_performed');
    expect(JSON.stringify(clarity.mock.calls)).not.toContain('private');
    analytics.setAnalyticsConsent(false);
    expect(clarity).toHaveBeenCalledWith('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    expect(clarity).toHaveBeenCalledWith('stop');
    clarity.mockClear();
    analytics.trackEvent('article_shared', { content_id: 'public-id', method: 'copy' });
    analytics.trackPageView('/ko/about');
    expect(clarity).not.toHaveBeenCalled();
    analytics.setAnalyticsConsent(true);
    analytics.initializeAnalytics();
    expect(clarity).toHaveBeenCalledWith('start');
  });
  it('ignores malformed configuration and recovers from a blocked script without breaking reading', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', 'https://evil.example');
    const { initializeHeatmaps, heatmapsConfigured } = await import('./heatmaps');
    expect(heatmapsConfigured).toBe(false);
    expect(() => initializeHeatmaps()).not.toThrow();
    expect(document.querySelector('#blog-clarity')).toBeNull();
  });
});
