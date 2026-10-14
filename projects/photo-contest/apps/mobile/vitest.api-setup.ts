import { startIsolatedApi } from '@photo-contest/test-kit';
import type { IIsolatedApi } from '@photo-contest/test-kit';
import type { TestProject } from 'vitest/node';

/** 모바일 api 레인 전용 포트. 개발 서버(4200)·다른 레인과 겹치지 않는다. */
const API_PORT = 4331;
/** API의 Origin 검사 기준(WEB_ORIGIN). 앱이 쓰는 웹 origin 역할을 한다. 실제 웹 서버는 띄우지 않는다. */
export const MOBILE_API_WEB_ORIGIN = 'http://localhost:3331';

let api: IIsolatedApi | undefined;

declare module 'vitest' {
  export interface ProvidedContext {
    apiUrl: string;
    webOrigin: string;
  }
}

/** 격리 스키마로 API를 한 번 띄워 모든 api spec이 같이 쓴다. 끝나면 스키마와 사진 폴더까지 지운다. */
export async function setup(project: TestProject) {
  api = await startIsolatedApi({
    port: API_PORT,
    webOrigin: MOBILE_API_WEB_ORIGIN,
    prefix: 'mobile_api',
    env: {
      GOOGLE_CLIENT_ID: 'mobile-test-client',
      GOOGLE_CLIENT_SECRET: 'mobile-test-secret',
      MOBILE_MINIMUM_VERSION: '1.0.0',
      MOBILE_LATEST_VERSION: '1.2.0',
    },
  });
  project.provide('apiUrl', api.url);
  project.provide('webOrigin', MOBILE_API_WEB_ORIGIN);
}

export async function teardown() {
  await api?.stop();
}
