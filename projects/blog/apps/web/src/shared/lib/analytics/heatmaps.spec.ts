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
afterEach(vi.unstubAllEnvs);

describe('opt-out behavior analytics', () => {
  it('loads Clarity once without GA4 and leaves its regional consent mode in charge', async () => {
    const analytics = await import('./events');
    expect(analytics.analyticsConfigured).toBe(true);
    analytics.trackPageView('/ko');
    analytics.trackPageView('/ko/about');
    expect(document.querySelectorAll('#blog-clarity')).toHaveLength(1);
    expect(document.querySelector('#blog-clarity')?.getAttribute('src')).toBe(
      'https://www.clarity.ms/tag/testproject1',
    );
    // 처음에는 동의 신호를 보내지 않아 EEA·영국·스위스 방문자에게는 Clarity가 쿠키를 만들지 않는다.
    expect(JSON.stringify(window.clarity?.q ?? [])).not.toContain('consentv2');
    expect(document.querySelector('#blog-google-analytics')).toBeNull();
  });
  it('stops on opt-out, sends only approved event names and resumes when turned back on', async () => {
    const analytics = await import('./events');
    analytics.initializeAnalytics();
    const clarity = vi.fn();
    window.clarity = clarity;
    analytics.trackEvent('search_performed', { has_query: true, query: 'private' } as { has_query: boolean });
    expect(clarity).toHaveBeenCalledWith('event', 'search_performed');
    expect(JSON.stringify(clarity.mock.calls)).not.toContain('private');
    analytics.setAnalyticsOptOut(true);
    expect(clarity).toHaveBeenCalledWith('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    expect(clarity).toHaveBeenCalledWith('stop');
    clarity.mockClear();
    analytics.trackEvent('article_shared', { content_id: 'public-id', method: 'copy' });
    analytics.trackPageView('/ko/about');
    expect(clarity).not.toHaveBeenCalled();
    analytics.setAnalyticsOptOut(false);
    analytics.initializeAnalytics();
    expect(clarity).toHaveBeenCalledWith('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    expect(clarity).toHaveBeenCalledWith('start');
  });
  it('ignores malformed configuration and recovers from a blocked script without breaking reading', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLARITY_PROJECT_ID', 'https://evil.example');
    const { initializeHeatmaps, heatmapsConfigured } = await import('./heatmaps');
    expect(heatmapsConfigured).toBe(false);
    expect(initializeHeatmaps).not.toThrow();
    expect(document.querySelector('#blog-clarity')).toBeNull();
  });
});
