import { resolve } from 'node:path';

import type { NextConfig } from 'next';

/**
 * 헤더는 빌드 때 고정되고 같은 이미지가 검증(http 저장소 대역)과 운영(S3)에 쓰이므로, 저장소 origin이 필요한
 * connect·img·media 출처는 제한하지 않는다. 대신 프레임 삽입·플러그인·base·폼 전송·외부 스크립트·iframe을 막는다.
 * Next·Apollo 스트리밍의 인라인 스크립트에 nonce를 쓰면 모든 화면이 동적 렌더링이 되므로 'unsafe-inline'을 둔다.
 * JSON-LD는 실행되지 않는 데이터 블록이고, 유튜브는 클릭 후 youtube-nocookie iframe으로만 연다.
 * 앱 WebView는 웹을 최상위 문서로 열고 네이티브 주입 스크립트는 CSP를 거치지 않는다.
 */
const CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "frame-src 'self' https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  // React 개발 모드는 오류 스택을 eval로 복원한다. 운영 빌드에는 넣지 않는다.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  // frame-ancestors를 모르는 오래된 브라우저용
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 유튜브 임베드는 origin을 Referer로 받아야 재생된다.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 파일 선택은 OS 선택기를 쓰므로 카메라 권한이 필요 없다. 공유·복사·전체 화면은 막지 않는다.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../../../..'),
  poweredByHeader: false,
  // Next 16 dev 서버는 distDir마다 잠금을 건다. e2e는 다른 distDir(.next/e2e)로 띄워 사용자의 dev 서버와 겹치지 않게 한다.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // 격리 API로 다시 실행하는 e2e는 이전 컴파일 상태를 이어받지 않는다.
  ...(process.env.NEXT_DIST_DIR?.startsWith('.next/e2e')
    ? { experimental: { turbopackFileSystemCacheForDev: false } }
    : {}),
  // 워크스페이스 패키지는 TypeScript 소스를 그대로 내보낸다.
  transpilePackages: ['@photo-contest/bridge', '@side/design-system'],
  async headers() {
    // 앱 로그인 콜백 안내 페이지는 Route Handler가 더 엄격한 CSP·no-referrer를 직접 붙인다. Next는 설정 헤더가 이미 있으면
    // 같은 이름의 응답 헤더를 버리므로(send-response) 이 경로만 공통 헤더에서 뺀다.
    return [{ source: '/:path((?!app-auth/callback$).*)', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      // 브라우저·앱 WebView는 같은 origin의 /backend/*로만 API를 부른다(세션 쿠키가 first-party로 붙는다).
      { source: '/backend/:path*', destination: `${process.env.API_URL || 'http://127.0.0.1:4200'}/:path*` },
      // 표준 경로는 바꿀 수 없어 app/에 점 폴더를 만들지 않고 kebab-case 라우트로 보낸다(앱 로그인 App Link·Universal Link 검증).
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/app-links/apple-app-site-association',
      },
      { source: '/.well-known/assetlinks.json', destination: '/app-links/assetlinks' },
    ];
  },
};

export default config;
