interface ILoadStart {
  platform: 'ios' | 'android';
  url: string;
  /** iOS만 준다. */
  navigationType?: string;
  /** 지금 보고 있던 문서 주소 */
  previousUrl: string;
}

function withoutHash(url: string) {
  return url.split('#', 1)[0] ?? url;
}

/**
 * onLoadStart가 새 문서를 여는 것인지. 새 문서면 이전 문서의 웹 브리지가 사라져 app.ready를 다시 기다려야 한다.
 * Android는 history.pushState 같은 화면 기록 변경에도 onLoadStart를 보내 새 문서인지 알 수 없으므로 false.
 * iOS는 해시만 바뀌면 같은 문서다.
 */
export function startsNewDocument({ platform, url, navigationType, previousUrl }: ILoadStart) {
  if (platform !== 'ios') return false;
  if (navigationType === 'reload') return true;
  return withoutHash(url) !== withoutHash(previousUrl);
}
