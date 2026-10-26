import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
function useTimeZone(timeZone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...resolvedOptions.call(this), timeZone };
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  useTimeZone('Asia/Seoul');
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

describe('visit statistics: opt-in in Europe, opt-out elsewhere', () => {
  it.each(['Europe/Berlin', 'Europe/London', 'Atlantic/Reykjavik', 'UTC'])(
    'makes no script or event in %s until the visitor allows statistics',
    async (timeZone) => {
      useTimeZone(timeZone);
      const analytics = await import('@/shared/lib/analytics/events');
      analytics.initializeAnalytics();
      analytics.trackPageView('/ko/blog?query=private');
      analytics.trackEvent('search_performed', { has_query: true });
      expect(analytics.statisticsAllowed()).toBe(false);
      expect(document.querySelector('#blog-google-analytics')).toBeNull();
      expect(window.dataLayer).toBeUndefined();
      analytics.setAnalyticsConsent('statistics');
      expect(analytics.statisticsAllowed()).toBe(true);
    },
  );
  it.each(['Asia/Seoul', 'America/New_York', 'Asia/Tokyo'])(
    'measures visitors in %s until they turn statistics off',
    async (timeZone) => {
      useTimeZone(timeZone);
      const analytics = await import('@/shared/lib/analytics/events');
      expect(analytics.statisticsAllowed()).toBe(true);
      expect(analytics.heatmapsAllowed()).toBe(false);
    },
  );
  it('sends one sanitized pageview per route before the visitor makes a choice', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    expect(analytics.analyticsConsent()).toBe('unknown');
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
  it('drops unapproved event properties and stops when the visitor turns everything off', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    const gtag = vi.fn();
    window.gtag = gtag;
    analytics.trackEvent('search_performed', { has_query: true, query: 'private' } as { has_query: boolean });
    expect(gtag).toHaveBeenCalledWith('event', 'search_performed', { has_query: true });
    document.cookie = '_ga=GA1.1.fixture; path=/';
    analytics.setAnalyticsConsent('denied');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    expect(document.cookie).not.toContain('_ga=');
    gtag.mockClear();
    analytics.trackEvent('search_performed', { has_query: true });
    analytics.trackPageView('/ko');
    expect(gtag).not.toHaveBeenCalled();
    expect(analytics.analyticsConsent()).toBe('denied');
    expect(analytics.statisticsAllowed()).toBe(false);
  });
  it('keeps statistics on when only heatmaps are declined', async () => {
    const analytics = await import('@/shared/lib/analytics/events');
    analytics.setAnalyticsConsent('statistics');
    expect(analytics.statisticsAllowed()).toBe(true);
    expect(analytics.heatmapsAllowed()).toBe(false);
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
    expect(analytics.analyticsConsent()).toBe('denied');
    expect(analytics.statisticsAllowed()).toBe(false);
    expect(() => analytics.trackPageView('/ko')).not.toThrow();
  });
});
