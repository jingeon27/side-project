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

afterEach(() => vi.unstubAllEnvs());

describe('optional consent-based analytics', () => {
  it('makes no script or event without explicit consent', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.initializeAnalytics();
    analytics.trackPageView('/ko/blog?query=private');
    analytics.trackEvent('search_performed', { has_query: true });
    expect(document.querySelector('#blog-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });
  it('initializes once and sends one sanitized pageview per route', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.setAnalyticsConsent(true);
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
  it('drops unapproved event properties and stops after consent withdrawal', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.setAnalyticsConsent(true);
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.trackEvent('search_performed', { has_query: true, query: 'private' } as { has_query: boolean });
    expect(gtag).toHaveBeenCalledWith('event', 'search_performed', { has_query: true });
    analytics.setAnalyticsConsent(false);
    gtag.mockClear();
    analytics.trackEvent('search_performed', { has_query: true });
    analytics.trackPageView('/ko');
    expect(gtag).not.toHaveBeenCalled();
    expect(analytics.hasAnalyticsConsent()).toBe(false);
  });
  it('tolerates SDK and local storage failures', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.setAnalyticsConsent(true);
    window.gtag = () => {
      throw new Error('blocked');
    };
    expect(() => analytics.trackEvent('category_selected', { category_id: 'engineering' })).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked storage');
    });
    expect(analytics.hasAnalyticsConsent()).toBe(false);
    expect(() => analytics.trackPageView('/ko')).not.toThrow();
  });
});
