import { heatmapsConfigured, initializeHeatmaps, stopHeatmaps } from './heatmaps';
import { isTrackedRegion } from './region';

type AnalyticsEventMap = {
  language_changed: { from_locale: string; to_locale: string };
  article_shared: { content_id: string; method: string };
  category_selected: { category_id: string };
  tag_selected: { tag_id: string };
  search_performed: { has_query: boolean };
};

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __blogAnalyticsInitialized?: boolean;
    __blogAnalyticsLastPath?: string;
  }
}

/** granted: 방문 통계와 히트맵, statistics: 방문 통계만, denied: 모두 끔. 저장된 값이 없으면 unknown이다. */
export type TAnalyticsChoice = 'granted' | 'statistics' | 'denied';
export type TAnalyticsConsent = TAnalyticsChoice | 'unknown';

export const consentKey = 'blog:analytics-consent';
export const consentChangedEvent = 'blog:analytics-consent-changed';
export const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
const googleAnalyticsConfigured = /^G-[A-Z0-9]+$/.test(measurementId);
export const analyticsConfigured = googleAnalyticsConfigured || heatmapsConfigured;

/** 저장소가 막히면 끄기 선택을 기억할 수 없으므로 아무것도 수집하지 않는다. */
export function analyticsConsent(): TAnalyticsConsent {
  try {
    if (typeof window === 'undefined') return 'denied';
    const value = window.localStorage.getItem(consentKey);
    return value === 'granted' || value === 'statistics' || value === 'denied' ? value : 'unknown';
  } catch {
    return 'denied';
  }
}

/** 한국 방문자는 끄기 전까지 GA4 방문 통계를 보낸다(opt-out). */
export function statisticsAllowed(): boolean {
  return googleAnalyticsConfigured && isTrackedRegion() && analyticsConsent() !== 'denied';
}

/** 클릭·스크롤 히트맵과 세션 재생은 한국 방문자가 명시적으로 허용했을 때만 켠다(opt-in). */
export function heatmapsAllowed(): boolean {
  return heatmapsConfigured && isTrackedRegion() && analyticsConsent() === 'granted';
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

export function setAnalyticsConsent(choice: TAnalyticsChoice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(consentKey, choice);
  } catch {
    /* Storage can be blocked. */
  }
  applyAnalyticsConsent();
  window.dispatchEvent(new Event(consentChangedEvent));
}

/** 저장된 선택을 현재 탭에 반영한다. 다른 탭의 변경(storage 이벤트)에도 같은 함수를 쓴다. */
export function applyAnalyticsConsent(): void {
  if (typeof window === 'undefined') return;
  const statistics = statisticsAllowed();
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = !statistics;
  if (!heatmapsAllowed()) stopHeatmaps();
  try {
    window.gtag?.('consent', 'update', { analytics_storage: statistics ? 'granted' : 'denied' });
  } catch {
    /* The SDK can be blocked. */
  }
  try {
    if (!statistics) {
      window.__blogAnalyticsLastPath = undefined;
      // Remove cookies on the current host and its parent-domain scopes.
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (!name?.startsWith('_ga')) continue;
        const domains = window.location.hostname.split('.');
        document.cookie = `${name}=; Max-Age=0; path=/`;
        while (domains.length > 1) {
          document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domains.join('.')}`;
          domains.shift();
        }
      }
    }
  } catch {
    // A blocked storage/analytics API must never prevent reading the blog.
  }
}

export function initializeAnalytics(): void {
  if (heatmapsAllowed()) initializeHeatmaps();
  if (!statisticsAllowed()) return;
  try {
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = false;
    if (window.__blogAnalyticsInitialized) return;
    window.__blogAnalyticsInitialized = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      ((...args: unknown[]) => {
        window.dataLayer?.push(args);
      });
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: safeUrl(window.location.href),
      page_referrer: safeUrl(document.referrer),
    });
    const script = document.createElement('script');
    script.id = 'blog-google-analytics';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  } catch {
    window.__blogAnalyticsInitialized = false;
  }
}

export function trackPageView(pathname: string): void {
  if (!analyticsConfigured) return;
  try {
    initializeAnalytics();
    if (!statisticsAllowed()) return;
    const path = safeUrl(pathname);
    if (!window.gtag || window.__blogAnalyticsLastPath === path) return;
    window.__blogAnalyticsLastPath = path;
    window.gtag('event', 'page_view', {
      page_location: path,
      page_referrer: safeUrl(document.referrer),
      page_title: document.title,
    });
  } catch {
    // Analytics is optional.
  }
}

const eventProperties: Record<keyof AnalyticsEventMap, readonly string[]> = {
  language_changed: ['from_locale', 'to_locale'],
  article_shared: ['content_id', 'method'],
  category_selected: ['category_id'],
  tag_selected: ['tag_id'],
  search_performed: ['has_query'],
};

export function trackEvent<K extends keyof AnalyticsEventMap>(
  name: K,
  properties: AnalyticsEventMap[K],
): void {
  if (!analyticsConfigured) return;
  try {
    if (heatmapsAllowed()) window.clarity?.('event', name);
    if (!statisticsAllowed() || !window.gtag) return;
    const filtered = Object.fromEntries(
      Object.entries(properties).filter(
        ([key, value]) => eventProperties[name].includes(key) && ['string', 'boolean'].includes(typeof value),
      ),
    );
    window.gtag('event', name, filtered);
  } catch {
    // A failed event must not interrupt navigation, search, or sharing.
  }
}
