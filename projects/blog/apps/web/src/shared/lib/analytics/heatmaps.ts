type ClarityCommand = ((...args: unknown[]) => void) & { q?: unknown[][] };
declare global {
  interface Window {
    clarity?: ClarityCommand;
    __blogHeatmapsInitialized?: boolean;
    __blogHeatmapsStopped?: boolean;
  }
}

const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || '';
export const heatmapsConfigured = /^[a-z0-9]{6,32}$/i.test(projectId);

/** GA4는 이탈·참여 지표를, Clarity는 클릭·스크롤 분포와 세션 재생을 담당한다. */
export function initializeHeatmaps(): void {
  if (!heatmapsConfigured || typeof window === 'undefined') return;
  try {
    if (window.__blogHeatmapsInitialized) {
      // 끄기를 되돌린 경우뿐이다. 방문자가 직접 다시 켰으므로 동의 신호를 보내고 수집을 재개한다.
      if (window.__blogHeatmapsStopped) {
        window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
        window.clarity?.('start');
      }
      window.__blogHeatmapsStopped = false;
      return;
    }
    const queue: ClarityCommand = (...args) => {
      (queue.q ??= []).push(args);
    };
    window.clarity ??= queue;
    // 처음에는 동의 신호를 보내지 않는다. Clarity가 EEA·영국·스위스 방문자에게는 기본 동의 모드로 쿠키를 만들지 않는다.
    const script = document.createElement('script');
    script.id = 'blog-clarity';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = `https://www.clarity.ms/tag/${projectId}`;
    script.onerror = () => {
      script.remove();
      window.__blogHeatmapsInitialized = false;
    };
    document.head.appendChild(script);
    window.__blogHeatmapsInitialized = true;
  } catch {
    // 분석이 차단되어도 글 읽기에는 영향을 주지 않는다.
  }
}

export function stopHeatmaps(): void {
  if (typeof window === 'undefined' || !window.__blogHeatmapsInitialized) return;
  try {
    window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    // denied 신호만으로는 쿠키 없는 측정이 남으므로 수집 모듈도 종료한다.
    window.clarity?.('stop');
    window.__blogHeatmapsStopped = true;
  } catch {
    // 차단된 SDK 오류를 제품 흐름으로 전파하지 않는다.
  }
}
