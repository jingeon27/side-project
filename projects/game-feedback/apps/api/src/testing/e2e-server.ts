import { createApp } from '../app';
import { ApiError } from '../common/http/api-error';
import { assertDatabaseUrl } from '../database/database-url';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { S3Fixture } from './s3-fixture';

async function main() {
  if (process.env.NODE_ENV !== 'test') throw new Error('E2E server requires NODE_ENV=test.');
  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL, 'test');
  const port = Number(process.env.PORT);
  if (
    ![4301, 4302, 4304, 4353].includes(port) ||
    process.env.WEB_ORIGIN !== `http://127.0.0.1:${port - 1000}`
  )
    throw new Error('E2E server requires the owned browser-test ports.');
  if (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET || process.env.SUPERCELL_API_TOKEN)
    throw new Error('E2E server must not use external provider credentials.');
  const s3 = await new S3Fixture({ corsOrigin: process.env.WEB_ORIGIN }).start();
  const app = await createApp({
    mediaStorage: s3.config,
    databaseUrl,
    demoMode: process.env.GF_DEMO_MODE === 'true',
    testAuthEnabled: process.env.GF_TEST_AUTH_ENABLED === 'true',
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
  app.getHttpServer().once('close', () => {
    void s3.close();
  });
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'E2E server failed.');
  process.exitCode = 1;
});
