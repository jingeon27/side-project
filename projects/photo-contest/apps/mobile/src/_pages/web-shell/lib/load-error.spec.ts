import { describe, expect, it } from 'vitest';

import { isOfflineHttpError, isOfflineLoadError } from './load-error';

const WEB_ORIGIN = 'https://contest.example';

describe('isOfflineLoadError', () => {
  it('웹 문서를 불러오지 못하면 오프라인 화면을 띄워야 한다', () => {
    expect(isOfflineLoadError({ url: 'https://contest.example/', code: -2 }, WEB_ORIGIN)).toBe(true);
    expect(
      isOfflineLoadError(
        { url: 'https://contest.example/groups/1', domain: 'NSURLErrorDomain', code: -1009 },
        WEB_ORIGIN,
      ),
    ).toBe(true);
  });

  it('이동 취소 오류는 무시해야 한다', () => {
    expect(
      isOfflineLoadError(
        { url: 'https://contest.example/', domain: 'NSURLErrorDomain', code: -999 },
        WEB_ORIGIN,
      ),
    ).toBe(false);
    expect(
      isOfflineLoadError(
        { url: 'https://contest.example/', domain: 'WebKitErrorDomain', code: 102 },
        WEB_ORIGIN,
      ),
    ).toBe(false);
  });

  it('웹 origin이 아닌 주소의 오류는 무시해야 한다', () => {
    expect(isOfflineLoadError({ url: 'https://ads.example/frame', code: -2 }, WEB_ORIGIN)).toBe(false);
    expect(isOfflineLoadError({ url: 'kakaolink://send', code: -10 }, WEB_ORIGIN)).toBe(false);
  });
});

describe('isOfflineHttpError', () => {
  it('웹 origin의 5xx만 오프라인 화면으로 바꿔야 한다', () => {
    expect(isOfflineHttpError({ url: 'https://contest.example/', statusCode: 502 }, WEB_ORIGIN)).toBe(true);
    expect(isOfflineHttpError({ url: 'https://contest.example/', statusCode: 503 }, WEB_ORIGIN)).toBe(true);
    expect(isOfflineHttpError({ url: 'https://contest.example/nope', statusCode: 404 }, WEB_ORIGIN)).toBe(
      false,
    );
    expect(isOfflineHttpError({ url: 'https://cdn.example/a.js', statusCode: 500 }, WEB_ORIGIN)).toBe(false);
  });
});
