import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 토큰은 CI에서만 읽으며 요청 실패 응답·인증 값은 로그에 남기지 않는다. */
export async function recordSentryRelease(env: NodeJS.ProcessEnv, request: typeof fetch = fetch) {
  const token = env.SENTRY_RELEASE_TOKEN?.trim();
  if (!token) return { skipped: true } as const;
  const projectId = env.SENTRY_PROJECT_ID?.trim() ?? '';
  const project = env.SENTRY_PROJECT?.trim() ?? '';
  const release = env.SENTRY_RELEASE?.trim() ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';
  if (
    !/^[a-f0-9]{32}$/.test(token) ||
    !/^[1-9][0-9]{0,20}$/.test(projectId) ||
    !/^[a-z0-9_-]+$/.test(project) ||
    !/^[a-f0-9]{40}$/.test(release) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository)
  )
    throw new Error('Invalid Sentry release webhook settings.');
  // 프로젝트 Releases에서 발급한 토큰은 웹훅 서명에 사용한다.
  const signature = createHmac('sha256', token).update(`builtin-${projectId}`).digest('hex');
  const url = `https://us.sentry.io/api/hooks/release/builtin/${projectId}/${signature}/`;
  const response = await request(url, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      version: release,
      url: `https://github.com/${repository}/commit/${release}`,
      dateReleased: new Date().toISOString(),
    }),
  }).catch(() => {
    throw new Error('Sentry release request failed.');
  });
  if (!response.ok) throw new Error(`Sentry release request failed (HTTP ${response.status}).`);
  return { skipped: false, project, release } as const;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await recordSentryRelease(process.env);
  console.log(
    result.skipped
      ? 'Sentry release registration skipped: no project release token configured.'
      : `Sentry release recorded: ${result.project} ${result.release}`,
  );
}
