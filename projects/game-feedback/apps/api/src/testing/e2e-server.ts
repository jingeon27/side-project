import { environment } from '../../../../scripts/env.ts';
import { createApp } from '../app';
import { ApiError } from '../common/http/api-error';
import { ensureRuntimeSecret } from '../config/runtime-secret';
import { assertDatabaseUrl } from '../database/database-url';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { S3TestStorage } from './s3';

async function main() {
  if (process.env.ENVIRONMENT !== 'test') throw new Error('E2E server requires NODE_ENV=test.');
  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL, 'test');
  const port = Number(new URL(process.env.GAME_FEEDBACK_API_URL ?? 'http://127.0.0.1:4301').port);
  if (
    ![4301, 4302, 4304, 4353, 4354].includes(port) ||
    process.env.WEB_ORIGIN !== `http://127.0.0.1:${port - 1000}`
  )
    throw new Error('E2E server requires the owned browser-test ports.');
  if (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET || process.env.SUPERCELL_API_TOKEN)
    throw new Error('E2E server must not use external provider credentials.');
  Object.assign(
    process.env,
    Object.fromEntries(
      Object.entries(environment()).filter(
        ([name, value]) => value !== undefined && (name.startsWith('GF_S3_') || name.startsWith('AWS_')),
      ),
    ),
  );
  const s3 = new S3TestStorage();
  await s3.verifyAccess();
  const app = await createApp({
    mediaStorage: s3.config,
    cacheRevalidation: {
      secret: ensureRuntimeSecret(),
      url: `${process.env.WEB_ORIGIN}/internal/cache/revalidate`,
    },
    databaseUrl,
    demoMode: !process.argv.includes('--no-demo'),
    testAuthEnabled: true,
    rateLimit: false,
    profileProvider: new DemoProfileProvider(),
    identityProvider: {
      authorizationUrl: ({ state, nonce }) => {
        const callback = new URL('/api/auth/google/callback', process.env.WEB_ORIGIN);
        callback.searchParams.set('state', state);
        callback.searchParams.set('code', `e2e-${nonce}`);
        return callback.toString();
      },
      exchange: async (code) => {
        if (!/^e2e-[A-Za-z0-9_-]{1,100}$/.test(code))
          throw new ApiError(400, 'OAUTH_CODE_INVALID', '테스트 로그인 코드를 확인해주세요.');
        return code;
      },
    },
  });
  const stopping = { value: false };
  const stop = async () => {
    if (stopping.value) return;
    stopping.value = true;
    try {
      try {
        await app.close();
      } finally {
        await s3.close();
      }
      process.exit(0);
    } catch {
      console.error('E2E shutdown or real S3 test cleanup failed.');
      process.exit(1);
    }
  };
  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });
  await app.listen(port, '127.0.0.1');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'E2E server failed.');
  process.exitCode = 1;
});
