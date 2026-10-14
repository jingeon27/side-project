#!/usr/bin/env node
// Playwright webServer에서 실행한다. TypeScript 원본을 tsx로 불러온다.
import { register } from 'tsx/esm/api';

register();
await import('../src/serve-api.ts');
