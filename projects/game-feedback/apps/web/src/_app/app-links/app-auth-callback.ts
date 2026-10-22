import { createHash } from 'node:crypto';

import { connection } from 'next/server';

import { SITE_NAME } from '@/shared/seo/metadata';

// 주소창·기록에서 일회용 코드를 지운다. 코드는 읽지도 보내지도 않는다.
const STRIP_QUERY_SCRIPT = "history.replaceState(null,'',location.pathname);";
const STYLE =
  'body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#fff;color:#111;font:16px/1.6 system-ui,-apple-system,sans-serif}' +
  'main{max-width:22rem;padding:24px;text-align:center}h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 12px;color:#555}a{color:inherit}';

function cspHash(source: string) {
  return `'sha256-${createHash('sha256').update(source).digest('base64')}'`;
}

/** 외부 스크립트·이미지·분석 도구를 하나도 불러오지 않는다. 인라인은 해시가 맞는 두 조각만 허용한다. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src ${cspHash(STRIP_QUERY_SCRIPT)}`,
  `style-src ${cspHash(STYLE)}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>앱에서 로그인을 계속해 주세요 · ${SITE_NAME}</title>
<script>${STRIP_QUERY_SCRIPT}</script>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>앱에서 로그인을 계속해 주세요</h1>
<p>${SITE_NAME} 앱으로 돌아가면 로그인이 이어집니다.</p>
<p>앱이 열리지 않았다면 이 창을 닫고 앱에서 소셜 로그인을 다시 시도해 주세요.</p>
<p><a href="/">웹에서 ${SITE_NAME} 열기</a></p>
</main>
</body>
</html>
`;

/**
 * 앱 로그인 콜백(`/app-auth/callback?code=`)이 앱 대신 브라우저에서 열렸을 때의 안내 페이지.
 * 앱이 없거나 링크 검증 전이면 여기로 온다. 요청 URL을 읽지 않아 코드가 화면·로그·분석·Sentry에 실리지 않고,
 * 이전 주소를 Referer로 넘기지 않으며 캐시하지 않는다.
 */
export async function appAuthCallback() {
  // 빌드 때 정적 응답으로 고정되면 Next가 캐시 헤더를 바꾼다. 매 요청 no-store로 답한다.
  await connection();
  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    },
  });
}
