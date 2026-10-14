import { initSentry } from './monitoring/sentry';

// main.ts가 가장 먼저 import해 다른 모듈보다 먼저 오류 보고를 준비한다.
initSentry();
