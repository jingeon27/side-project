import { originOf } from '@photo-contest/bridge';

interface ILoadError {
  url: string;
  /** iOS만 준다. */
  domain?: string;
  code: number;
}

/**
 * 링크를 밖에서 열려고 이동을 취소하거나 빠르게 다른 곳으로 이동하면 iOS WebView가 내는 오류.
 * 연결 문제가 아니라서 오프라인 화면을 띄우지 않는다.
 */
const CANCELLED_LOAD_ERRORS = [
  { domain: 'NSURLErrorDomain', code: -999 },
  { domain: 'WebKitErrorDomain', code: 101 },
  { domain: 'WebKitErrorDomain', code: 102 },
] as const satisfies readonly Required<Pick<ILoadError, 'domain' | 'code'>>[];

/** 웹 origin 메인 문서를 불러오지 못했을 때만 오프라인 화면을 띄운다. */
export function isOfflineLoadError({ url, domain, code }: ILoadError, webOrigin: string) {
  if (originOf(url) !== originOf(webOrigin)) return false;
  return !CANCELLED_LOAD_ERRORS.some((error) => error.domain === domain && error.code === code);
}

/** 4xx는 웹이 직접 그린 안내 화면(없는 페이지 등)이라 그대로 두고, 서버·프록시 오류만 오프라인 화면으로 바꾼다. */
export function isOfflineHttpError(
  { url, statusCode }: { url: string; statusCode: number },
  webOrigin: string,
) {
  return statusCode >= 500 && originOf(url) === originOf(webOrigin);
}
