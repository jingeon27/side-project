import { resolveAppRoute } from '@game-feedback/bridge';

import { subscribeBrowserLocation } from '@/shared/navigation';

import { ANALYTICS_EVENT, type TAnalyticsProperties } from './analytics.catalog';
import { trackEvent } from './analytics.store';

const CONTROLS =
  'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="option"],[role="combobox"],[role="checkbox"],[role="switch"],summary,[contenteditable="true"]';
const ACTIONS: Record<string, string> = {
  글쓰기: 'compose',
  'Write a post': 'compose',
  投稿する: 'compose',
  검색: 'search',
  Search: 'search',
  検索: 'search',
  신고: 'report',
  Report: 'report',
  通報: 'report',
  차단: 'block',
  Block: 'block',
  ブロック: 'block',
  팔로우: 'follow',
  Follow: 'follow',
  フォロー: 'follow',
  채팅하기: 'start_chat',
  Chat: 'chat',
  チャット: 'chat',
  취소: 'cancel',
  Cancel: 'cancel',
  キャンセル: 'cancel',
  닫기: 'close',
  Close: 'close',
  閉じる: 'close',
  로그인하기: 'login',
  'Sign in': 'login',
  ログインする: 'login',
  홈: 'home',
  Home: 'home',
  ホーム: 'home',
  프로필: 'profile',
  Profile: 'profile',
  プロフィール: 'profile',
};

function surface(element: Element) {
  if (element.closest('[role="dialog"],[role="alertdialog"]')) return 'dialog';
  if (element.closest('.mobile-nav')) return 'bottom_navigation';
  if (element.closest('header.topbar')) return 'header';
  if (element.closest('aside,.left-sidebar')) return 'sidebar';
  if (element.closest('footer')) return 'footer';
  return 'content';
}

/** 사용자 문구·검색어·입력값·URL 쿼리는 속성에 포함하지 않는다. */
export function interactionProperties(
  element: Element,
  interaction: TAnalyticsProperties['ui_interaction']['interaction'],
): TAnalyticsProperties['ui_interaction'] {
  const role = element.getAttribute('role');
  const kind = element instanceof HTMLInputElement ? element.type : (role ?? element.tagName.toLowerCase());
  const label = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
  const region = element.closest('[role="dialog"],header,footer,nav,main') ?? element.parentElement;
  const properties: TAnalyticsProperties['ui_interaction'] = {
    interaction,
    surface: surface(element),
    control: kind,
    action:
      (Object.hasOwn(ACTIONS, label) ? ACTIONS[label] : undefined) ??
      element.getAttribute('data-analytics-action') ??
      role ??
      element.tagName.toLowerCase(),
    position: region ? Array.from(region.querySelectorAll(CONTROLS)).indexOf(element) : 0,
  };
  if (element instanceof HTMLAnchorElement) {
    const destination = new URL(element.href, location.origin);
    properties.destination_screen =
      destination.origin === location.origin
        ? (resolveAppRoute(destination.pathname + destination.search)?.screen ?? 'unknown')
        : 'external';
  }
  if (element instanceof HTMLSelectElement) properties.selected_index = element.selectedIndex;
  if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type))
    properties.checked = element.checked;
  if (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && ['text', 'search'].includes(element.type))
  )
    properties.has_text = element.value.length > 0;
  return properties;
}

class InteractionTracking {
  private path = location.pathname;
  private activeSince = performance.now();
  private activeMs = 0;
  private maxScroll = 0;
  private lastReportedActiveMs = -1;
  private readonly depths = new Set<number>();
  private inputTimer?: number;
  private scrollFrame?: number;

  constructor(private readonly send: typeof trackEvent) {}

  private synchronizePath() {
    if (this.path === location.pathname) return;
    this.reportEngagement();
    this.path = location.pathname;
    this.activeSince = performance.now();
    this.activeMs = 0;
    this.maxScroll = 0;
    this.depths.clear();
    this.lastReportedActiveMs = -1;
  }

  private reportEngagement() {
    const activeMs = this.activeMs + (document.hidden ? 0 : performance.now() - this.activeSince);
    if (this.lastReportedActiveMs === activeMs) return;
    this.lastReportedActiveMs = activeMs;
    this.send(ANALYTICS_EVENT.PageEngagement, {
      engaged_screen: resolveAppRoute(this.path)?.screen ?? 'unknown',
      active_seconds: Math.round(activeMs / 1000),
      max_scroll_percent: this.maxScroll,
    });
  }

  readonly handleInteraction = (event: Event) => {
    this.synchronizePath();
    if (!(event.target instanceof Element)) return;
    const target = event.type === 'submit' ? event.target.closest('form') : event.target.closest(CONTROLS);
    if (!target) return;
    const interaction = event.type === 'focusin' ? 'focus' : event.type;
    if (!['click', 'focus', 'change', 'input', 'submit'].includes(interaction)) return;
    const properties = interactionProperties(
      target,
      interaction as TAnalyticsProperties['ui_interaction']['interaction'],
    );
    if (event.type === 'input') {
      window.clearTimeout(this.inputTimer);
      const path = location.pathname;
      this.inputTimer = window.setTimeout(() => {
        if (location.pathname === path) this.send(ANALYTICS_EVENT.Interaction, properties);
      }, 600);
      return;
    }
    this.send(ANALYTICS_EVENT.Interaction, properties);
  };

  readonly handleScroll = () => {
    if (this.scrollFrame !== undefined) return;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      this.synchronizePath();
      const length = document.documentElement.scrollHeight - window.innerHeight;
      if (length <= 0) return;
      const percent = Math.min(100, Math.max(0, Math.round((window.scrollY / length) * 100)));
      this.maxScroll = Math.max(this.maxScroll, percent);
      for (const depth of [25, 50, 75, 100]) {
        if (percent < depth || this.depths.has(depth)) continue;
        this.depths.add(depth);
        this.send(ANALYTICS_EVENT.ScrollDepth, { percent: depth });
      }
    });
  };

  readonly handleVisibility = () => {
    if (document.hidden) {
      this.activeMs += performance.now() - this.activeSince;
      this.reportEngagement();
      return;
    }
    this.synchronizePath();
    this.activeSince = performance.now();
  };

  readonly handlePageHide = () => this.reportEngagement();
  readonly handleNavigation = () => this.synchronizePath();

  dispose() {
    window.clearTimeout(this.inputTimer);
    if (this.scrollFrame !== undefined) window.cancelAnimationFrame(this.scrollFrame);
  }
}

export function installInteractionTracking(send = trackEvent) {
  const tracking = new InteractionTracking(send);
  const unsubscribe = subscribeBrowserLocation(tracking.handleNavigation);
  for (const type of ['click', 'focusin', 'change', 'input', 'submit'])
    document.addEventListener(type, tracking.handleInteraction, true);
  window.addEventListener('scroll', tracking.handleScroll, { passive: true });
  document.addEventListener('visibilitychange', tracking.handleVisibility);
  window.addEventListener('pagehide', tracking.handlePageHide);
  return () => {
    unsubscribe();
    for (const type of ['click', 'focusin', 'change', 'input', 'submit'])
      document.removeEventListener(type, tracking.handleInteraction, true);
    window.removeEventListener('scroll', tracking.handleScroll);
    document.removeEventListener('visibilitychange', tracking.handleVisibility);
    window.removeEventListener('pagehide', tracking.handlePageHide);
    tracking.dispose();
  };
}
