import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  localStorage.clear();
  document.head.querySelector('#blog-google-analytics')?.remove();
  delete window.gtag;
  delete window.dataLayer;
  delete window.__blogAnalyticsInitialized;
  delete window.__blogAnalyticsLastPath;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('opt-out visit statistics', () => {
  it('makes no script or event without a measurement ID', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.trackPageView('/ko');
    expect(analytics.analyticsConfigured).toBe(false);
    expect(document.querySelector('#blog-google-analytics')).toBeNull();
  });
  it('sends one sanitized pageview per route without asking first', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.initializeAnalytics();
    analytics.initializeAnalytics();
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.trackPageView('/ko/blog?query=private#section');
    analytics.trackPageView('/ko/blog?query=other');
    expect(document.querySelectorAll('#blog-google-analytics')).toHaveLength(1);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.objectContaining({ page_location: `${window.location.origin}/ko/blog` }),
    );
    expect(JSON.stringify(gtag.mock.calls)).not.toContain('private');
    analytics.trackPageView('/ko/about');
    expect(gtag).toHaveBeenCalledTimes(2);
  });
  it('drops unapproved event properties and stops after the visitor turns collection off', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.trackEvent('search_performed', { has_query: true, query: 'private' } as { has_query: boolean });
    expect(gtag).toHaveBeenCalledWith('event', 'search_performed', { has_query: true });
    document.cookie = '_ga=GA1.1.fixture; path=/';
    analytics.setAnalyticsOptOut(true);
    expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    expect(document.cookie).not.toContain('_ga=');
    gtag.mockClear();
    analytics.trackEvent('search_performed', { has_query: true });
    analytics.trackPageView('/ko');
    expect(gtag).not.toHaveBeenCalled();
    expect(analytics.analyticsOptedOut()).toBe(true);
    analytics.setAnalyticsOptOut(false);
    expect(localStorage.getItem('blog:analytics-consent')).toBeNull();
    expect(analytics.statisticsAllowed()).toBe(true);
  });
  it('keeps measuring browsers that allowed analytics in the earlier consent banner', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    for (const value of ['granted', 'statistics']) {
      localStorage.setItem('blog:analytics-consent', value);
      expect(analytics.statisticsAllowed()).toBe(true);
    }
  });
  it('collects nothing when storage is blocked because the opt-out cannot be remembered', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    window.gtag = () => {
      throw new Error('blocked');
    };
    expect(() => analytics.trackEvent('category_selected', { category_id: 'engineering' })).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked storage');
    });
    expect(analytics.analyticsOptedOut()).toBe(true);
    expect(analytics.statisticsAllowed()).toBe(false);
    expect(() => analytics.trackPageView('/ko')).not.toThrow();
  });
});
