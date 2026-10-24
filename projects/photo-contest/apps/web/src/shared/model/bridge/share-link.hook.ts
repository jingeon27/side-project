import { useMemo } from 'react';

import { useBridge } from './bridge.hook';
import { copyText, openExternalLink, shareLink, type IShareContent } from './share-link.helper';

/**
 * 링크 공유·복사. 앱이면 앱 기능을, 아니면 Web Share API·클립보드를 쓰고, 둘 다 없으면 복사로 대신한다.
 * 결과(TShareOutcome)에 맞는 안내(토스트)는 부르는 쪽이 정한다.
 */
export function useShareLink() {
  const bridge = useBridge();
  return useMemo(() => {
    const environment = () => ({ bridge, navigator: window.navigator, document: window.document });
    return {
      share: (url: string, content: IShareContent = {}) => shareLink(url, content, environment()),
      copy: (text: string) => copyText(text, environment()),
    };
  }, [bridge]);
}

/** 외부 링크 열기. 앱이면 시스템 브라우저(link.open), 아니면 새 탭 */
export function useExternalLink() {
  const bridge = useBridge();
  return useMemo(
    () => ({ open: (url: string) => openExternalLink(url, { bridge, open: window.open.bind(window) }) }),
    [bridge],
  );
}
