import type { TestProject } from 'vitest/node';

import { startIsolatedApi } from '@photo-contest/test-kit';

declare module 'vitest' {
  export interface ProvidedContext {
    apiUrl: string;
    databaseUrl: string;
  }
}

/** api 프로젝트 전용. 격리 스키마로 API를 한 번 띄우고 모든 spec이 같은 서버를 쓴다. */
export default async function setup(project: TestProject) {
  const api = await startIsolatedApi({ port: 4321, webOrigin: 'http://localhost:3321', prefix: 'web_api' });
  project.provide('apiUrl', api.url);
  project.provide('databaseUrl', api.databaseUrl);
  return async () => {
    await api.stop();
  };
}
