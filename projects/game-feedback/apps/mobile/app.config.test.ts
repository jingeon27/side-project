import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import appConfig from './app.config';

/** env로 appConfig를 부르는 동안 process.env에서 읽은 키를 돌려준다. */
function keysReadByAppConfig(env: NodeJS.ProcessEnv) {
  const read = new Set<string>();
  const projectEnv = process.env;
  // 공개 관측 키는 readBuildSettings를 거치지 않고 appConfig가 process.env에서 바로 읽으므로 process.env째 바꿔 기록한다.
  process.env = new Proxy(env, {
    get(target, key) {
      if (typeof key === 'string') read.add(key);
      return Reflect.get(target, key);
    },
  });
  try {
    appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
  } finally {
    process.env = projectEnv;
  }
  return read;
}

// 앱 빌드가 새로 읽은 MOBILE_EAS_PROJECT_ID가 템플릿에 없어 운영자가 키를 알 수 없었다.
it('앱 빌드가 읽는 루트 키는 프로젝트 .env.example에 모두 있어야 한다', () => {
  // 한 분기에서만 읽는 키도 잡도록 개발과 운영 빌드를 모두 기록한다. 운영은 WEB_ORIGIN이 없으면 빌드를 멈추므로 HTTPS origin을 넣는다.
  // NODE_ENV는 읽지 않지만 Expo의 ProcessEnv 타입이 요구해서 둔다.
  const read = new Set([
    ...keysReadByAppConfig({ NODE_ENV: 'development', ENVIRONMENT: 'development' }),
    ...keysReadByAppConfig({
      NODE_ENV: 'production',
      ENVIRONMENT: 'production',
      WEB_ORIGIN: 'https://site.example',
    }),
  ]);
  const template = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  const defined = new Set([...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(([, key]) => key));

  expect([...read]).toContain('MOBILE_EAS_PROJECT_ID');
  expect([...read].filter((key) => !defined.has(key))).toEqual([]);
});
