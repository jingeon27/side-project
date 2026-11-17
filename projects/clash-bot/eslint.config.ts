import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

const src = 'apps/agent/src';
// 의존은 shared ← core ← (qwen, arena) ← counterpush/{perception, browser, learning, match} ← loop 한 방향이다.
// 상대 경로의 폴더 이름으로 금지할 아래 계층을 적는다. 진입점(cli.ts)과 loop는 모든 계층을 쓸 수 있다.
const layers: Array<{ files: string; forbidden: string[]; reason: string }> = [
  {
    files: `${src}/shared/**`,
    forbidden: ['(^|/)(core|counterpush|qwen|arena|trophy)/'],
    reason: 'shared는 파일·프로세스 기반 기능만 소유한다',
  },
  {
    files: `${src}/core/**`,
    forbidden: ['(^|/)(counterpush|qwen|arena|trophy)/'],
    reason: 'core는 실행 환경에 의존하지 않는 게임 규칙과 판단 계약이다',
  },
  { files: `${src}/qwen/**`, forbidden: ['(^|/)(counterpush|arena)/'], reason: 'qwen은 모델 클라이언트다' },
  {
    files: `${src}/trophy/**`,
    forbidden: ['(^|/)(counterpush|qwen|arena)/'],
    reason: '트로피의 자기 행동 학습·평가는 다른 게임 실행기와 독립적이다',
  },
  {
    files: `${src}/arena/**`,
    forbidden: ['(^|/)counterpush/'],
    reason: 'arena는 Counterpush와 독립된 자가대국이다',
  },
  {
    files: `${src}/counterpush/profile.ts`,
    forbidden: ['^\\./(perception|browser|learning|match|loop)/', '(^|/)(qwen|arena)/'],
    reason: '프로필은 Counterpush 모듈의 기반이다',
  },
  {
    files: `${src}/counterpush/perception/**`,
    forbidden: ['^\\.\\./(browser|learning|match|loop)/', '(^|/)(qwen|arena)/'],
    reason: '인식은 화면을 core 상태로 바꾸기만 한다',
  },
  {
    files: `${src}/counterpush/browser/**`,
    forbidden: ['^\\.\\./(learning|match|loop)/', '(^|/)(qwen|arena)/'],
    reason: '브라우저는 사이트 조작만 소유한다',
  },
  {
    files: `${src}/counterpush/learning/**`,
    forbidden: ['^\\.\\./(browser|match|loop)/', '(^|/)arena/'],
    reason: '학습 자료 준비는 저장된 기록만 읽고 브라우저를 열지 않는다',
  },
  {
    files: `${src}/counterpush/match/**`,
    forbidden: ['^\\.\\./(learning|loop)/', '(^|/)arena/'],
    reason: '경기 한 판은 학습·평가 순서를 알지 못한다',
  },
];

// .data는 실행 기록과 Python 도구 환경이며 저장소 코드가 아니다.
export default defineConfig([
  { ignores: ['.data/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
  ...layers.map((layer) => ({
    files: [layer.files],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: layer.forbidden.map((regex) => ({ regex, message: `${layer.reason}.` })) },
      ],
    },
  })),
]);
