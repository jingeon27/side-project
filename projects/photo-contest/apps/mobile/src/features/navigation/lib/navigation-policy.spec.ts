import { describe, expect, it } from 'vitest';

import { decideNavigation, decideOpenWindow } from './navigation-policy';

const OPTIONS = { webOrigin: 'https://contest.example', appScheme: 'photocontest' };

function decide(url: string, isTopFrame?: boolean) {
  return decideNavigation({ url, isTopFrame }, OPTIONS);
}

describe('decideNavigation', () => {
  it('웹 origin과 빈 문서는 WebView에서 열어야 한다', () => {
    expect(decide('https://contest.example/')).toEqual({ action: 'allow' });
    expect(decide('https://contest.example/groups/1?tab=ranking#top')).toEqual({ action: 'allow' });
    expect(decide('HTTPS://Contest.Example/backend/auth/google')).toEqual({ action: 'allow' });
    expect(decide('about:blank')).toEqual({ action: 'allow' });
    expect(decide('about:srcdoc')).toEqual({ action: 'allow' });
  });

  it('앱 스킴 링크는 막고 웹 경로 이동으로 바꿔야 한다', () => {
    expect(decide('photocontest://groups/12')).toEqual({ action: 'open-in-web', path: '/groups/12' });
    expect(decide('photocontest://invite/abc_DEF-1')).toEqual({
      action: 'open-in-web',
      path: '/invite/abc_DEF-1',
    });
    expect(decide('photocontest://auth/callback?code=abc')).toEqual({ action: 'block' });
    expect(decide('photocontest://groups/../../me')).toEqual({ action: 'block' });
  });

  it('다른 사이트로 가는 메인 문서 이동은 밖에서 열어야 한다', () => {
    expect(decide('https://outside.example/path?ref=x')).toEqual({
      action: 'open-external',
      url: 'https://outside.example/path?ref=x',
      fallbackUrl: null,
    });
    expect(decide('http://contest.example/groups/1')).toMatchObject({ action: 'open-external' });
    expect(decide('https://contest.example.evil.example/')).toMatchObject({ action: 'open-external' });
    expect(decide('https://contest.example@evil.example/')).toMatchObject({ action: 'open-external' });
    expect(decide('https://evil.example/', true)).toMatchObject({ action: 'open-external' });
  });

  it('다른 origin iframe은 앱 문서를 바꾸지 않으므로 그대로 둬야 한다', () => {
    expect(decide('https://www.youtube.com/embed/x', false)).toEqual({ action: 'allow' });
  });

  it('iframe이 http(s)가 아닌 스킴으로 이동하면 외부 앱·앱 이동 없이 막아야 한다', () => {
    for (const url of [
      'kakaotalk://inappbrowser?url=x',
      'tel:01012345678',
      'market://details?id=com.evil.app',
      'intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;end',
      'photocontest://groups/12',
      'javascript:alert(1)',
    ])
      expect(decide(url, false)).toEqual({ action: 'block' });
    // 빈 문서·srcdoc iframe은 그대로 연다.
    expect(decide('about:blank', false)).toEqual({ action: 'allow' });
    expect(decide('about:srcdoc', false)).toEqual({ action: 'allow' });
  });

  it('전화·메일·다른 앱 스킴은 밖에서 열어야 한다', () => {
    expect(decide('tel:01012345678')).toEqual({
      action: 'open-external',
      url: 'tel:01012345678',
      fallbackUrl: null,
    });
    expect(decide('mailto:help@contest.example')).toMatchObject({ action: 'open-external' });
    expect(decide('kakaotalk://inappbrowser?url=x')).toMatchObject({ action: 'open-external' });
    expect(decide('market://details?id=com.kakao.talk')).toMatchObject({ action: 'open-external' });
  });

  it('스크립트·로컬 파일·데이터 URL은 어디에서도 열지 않아야 한다', () => {
    expect(decide('javascript:alert(document.cookie)')).toEqual({ action: 'block' });
    expect(decide('JavaScript:alert(1)')).toEqual({ action: 'block' });
    expect(decide('data:text/html,<script>alert(1)</script>')).toEqual({ action: 'block' });
    expect(decide('blob:https://contest.example/uuid')).toEqual({ action: 'block' });
    expect(decide('file:///etc/passwd')).toEqual({ action: 'block' });
    expect(decide('content://media/external/images/1')).toEqual({ action: 'block' });
    expect(decide('about:config')).toEqual({ action: 'block' });
    expect(decide('/relative/path')).toEqual({ action: 'block' });
    expect(decide('')).toEqual({ action: 'block' });
  });

  it('Android intent URI를 대상 앱 스킴으로 바꾸고 대체 주소를 함께 줘야 한다', () => {
    const fallback = encodeURIComponent('https://www.kakaocorp.com/page/service/service/KakaoTalk');
    expect(
      decide(
        `intent://send?msg=hi#Intent;scheme=kakaolink;package=com.kakao.talk;S.browser_fallback_url=${fallback};end`,
      ),
    ).toEqual({
      action: 'open-external',
      url: 'kakaolink://send?msg=hi',
      fallbackUrl: 'https://www.kakaocorp.com/page/service/service/KakaoTalk',
    });
    expect(decide('intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;end')).toEqual({
      action: 'open-external',
      url: 'zxing://scan/',
      fallbackUrl: 'market://details?id=com.google.zxing.client.android',
    });
  });

  it('intent URI가 이상하면 안전한 대체 주소만 열거나 막아야 한다', () => {
    const fallback = encodeURIComponent('https://contest.example/help');
    expect(decide(`intent://x#Intent;scheme=javascript;S.browser_fallback_url=${fallback};end`)).toEqual({
      action: 'open-external',
      url: 'https://contest.example/help',
      fallbackUrl: null,
    });
    expect(decide('intent://x#Intent;scheme=javascript;end')).toEqual({ action: 'block' });
    expect(decide('intent://x#Intent;scheme=intent;end')).toEqual({ action: 'block' });
    expect(
      decide(`intent://x#Intent;S.browser_fallback_url=${encodeURIComponent('javascript:alert(1)')};end`),
    ).toEqual({ action: 'block' });
    expect(decide('intent://x#Intent;scheme=kakaolink;package=bad;package;end')).toEqual({
      action: 'open-external',
      url: 'kakaolink://x',
      fallbackUrl: null,
    });
    expect(decide('intent://no-fragment')).toEqual({ action: 'block' });
  });

  it('앱 스킴을 가리키는 intent는 웹 경로 이동으로 바꿔야 한다', () => {
    expect(decide('intent://groups/3#Intent;scheme=photocontest;end')).toEqual({
      action: 'open-in-web',
      path: '/groups/3',
    });
  });
});

describe('decideOpenWindow', () => {
  it('같은 origin 새 창은 지금 WebView의 웹 경로 이동으로 바꿔야 한다', () => {
    expect(decideOpenWindow('https://contest.example/contests/5?sort=popular', OPTIONS)).toEqual({
      action: 'open-in-web',
      path: '/contests/5?sort=popular',
    });
    expect(decideOpenWindow('https://contest.example', OPTIONS)).toEqual({
      action: 'open-in-web',
      path: '/',
    });
    expect(decideOpenWindow('https://contest.example?ref=1', OPTIONS)).toEqual({
      action: 'open-in-web',
      path: '/?ref=1',
    });
  });

  it('다른 사이트 새 창은 밖에서 열어야 한다', () => {
    expect(decideOpenWindow('https://help.example/terms', OPTIONS)).toEqual({
      action: 'open-external',
      url: 'https://help.example/terms',
      fallbackUrl: null,
    });
  });

  it('빈 창이나 다른 origin으로 새는 경로는 열지 않아야 한다', () => {
    expect(decideOpenWindow('about:blank', OPTIONS)).toEqual({ action: 'block' });
    expect(decideOpenWindow('https://contest.example//evil.example/x', OPTIONS)).toEqual({ action: 'block' });
    expect(decideOpenWindow('https://contest.example/\\evil.example', OPTIONS)).toEqual({ action: 'block' });
  });
});
