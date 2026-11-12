import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import appConfig from './app.config';

// 앱 빌드가 새로 읽은 MOBILE_EAS_PROJECT_ID·MOBILE_IOS_APP_STORE_ID가 템플릿에 없어 운영자가 키를 알 수 없었다.
it('앱 빌드가 읽는 루트 키는 프로젝트 .env.example에 모두 있어야 한다', () => {
  const read = new Set<string>();
  const projectEnv = process.env;
  // 공개 관측 키는 readBuildSettings를 거치지 않고 appConfig가 process.env에서 바로 읽으므로 process.env째 바꿔 기록한다.
  process.env = new Proxy<NodeJS.ProcessEnv>(
    { NODE_ENV: 'development' },
    {
      get(target, key) {
        if (typeof key === 'string') read.add(key);
        return Reflect.get(target, key);
      },
    },
  );
  try {
    appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
  } finally {
    process.env = projectEnv;
  }
  const template = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  const defined = new Set([...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(([, key]) => key));

  expect(read.size).toBeGreaterThan(0);
  expect([...read].filter((key) => !defined.has(key))).toEqual([]);
});
