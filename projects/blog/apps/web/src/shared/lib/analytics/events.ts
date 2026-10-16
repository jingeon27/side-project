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

export const consentKey = 'blog:analytics-consent';
export const consentChangedEvent = 'blog:analytics-consent-changed';
export const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
export const analyticsConfigured = /^G-[A-Z0-9]+$/.test(measurementId);

export function hasAnalyticsConsent(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(consentKey) === 'granted';
  } catch {
    return false;
  }
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

export function setAnalyticsConsent(granted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(consentKey, granted ? 'granted' : 'denied');
  } catch {
    /* Storage can be blocked. */
  }
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = !granted;
  try {
    window.gtag?.('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
  } catch {
    /* The SDK can be blocked. */
  }
  try {
    if (!granted) {
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
  window.dispatchEvent(new Event(consentChangedEvent));
}

export function initializeAnalytics(): void {
  if (!analyticsConfigured || !hasAnalyticsConsent()) return;
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
  if (!analyticsConfigured || !hasAnalyticsConsent()) return;
  try {
    initializeAnalytics();
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
  if (!analyticsConfigured || !hasAnalyticsConsent()) return;
  try {
    if (!window.gtag) return;
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
