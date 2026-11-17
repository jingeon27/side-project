import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

const src = 'apps/agent/src';
// 의존은 shared ← core ← (qwen, arena) ← counterpush/{perception, browser, learning, match} ← evaluation ← loop 한 방향이다.
// core 안은 기반 모듈 ← battle ← placement ← policy ← fast 순서이고, trophy는 shared·core만 쓰며 다른 실행기가
// trophy를 가져오지 않는다. 상대 경로의 폴더 이름으로 금지할 계층을 적는다. 진입점(cli.ts)과 loop는 trophy 외의
// 모든 계층을 쓸 수 있다. 한 파일에 여러 항목이 맞으면 뒤의 항목이 앞의 것을 대신하므로, 좁은 범위의 항목은
// 넓은 범위의 금지 목록을 함께 적는다.
const runners = '(^|/)(counterpush|qwen|arena|trophy)/';
const trophy = '(^|/)trophy/';
const layers: Array<{ files: string; forbidden: string[]; reason: string }> = [
  {
    files: `${src}/shared/**`,
    forbidden: ['(^|/)(core|counterpush|qwen|arena|trophy)/'],
    reason: 'shared는 파일·프로세스 기반 기능만 소유한다',
  },
  {
    files: `${src}/core/**`,
    forbidden: [runners],
    reason: 'core는 실행 환경에 의존하지 않는 게임 규칙과 판단 계약이다',
  },
  {
    files: `${src}/core/*.ts`,
    forbidden: [runners, '^\\./(battle|placement|policy|fast)/'],
    reason: 'core 바로 아래 모듈은 카드·좌표·프로필 같은 기반이다',
  },
  {
    files: `${src}/core/battle/**`,
    forbidden: [runners, '^\\.\\./(placement|policy|fast)/'],
    reason: 'battle은 배치와 판단보다 아래 계층이다',
  },
  {
    files: `${src}/core/placement/**`,
    forbidden: [runners, '^\\.\\./(policy|fast)/'],
    reason: 'placement는 판단 계약보다 아래 계층이다',
  },
  {
    files: `${src}/core/policy/**`,
    forbidden: [runners, '^\\.\\./fast/'],
    reason: 'policy는 빠른 정책보다 아래 계층이다',
  },
  {
    files: `${src}/qwen/**`,
    forbidden: ['(^|/)(counterpush|arena|trophy)/'],
    reason: 'qwen은 모델 클라이언트다',
  },
  {
    files: `${src}/trophy/**`,
    forbidden: ['(^|/)(counterpush|qwen|arena)/'],
    reason: '트로피의 자기 행동 학습·평가는 다른 게임 실행기와 독립적이다',
  },
  {
    files: `${src}/arena/**`,
    forbidden: ['(^|/)(counterpush|trophy)/'],
    reason: 'arena는 Counterpush·트로피와 독립된 자가대국이다',
  },
  {
    files: `${src}/counterpush/**`,
    forbidden: [trophy],
    reason: 'Counterpush와 트로피는 모델과 실행을 서로 섞지 않는다',
  },
  {
    files: `${src}/counterpush/profile.ts`,
    forbidden: [trophy, '^\\./(perception|browser|learning|match|evaluation|loop)/', '(^|/)(qwen|arena)/'],
    reason: '프로필은 Counterpush 모듈의 기반이다',
  },
  {
    files: `${src}/counterpush/perception/**`,
    forbidden: [trophy, '^\\.\\./(browser|learning|match|evaluation|loop)/', '(^|/)(qwen|arena)/'],
    reason: '인식은 화면을 core 상태로 바꾸기만 한다',
  },
  {
    files: `${src}/counterpush/browser/**`,
    forbidden: [trophy, '^\\.\\./(learning|match|evaluation|loop)/', '(^|/)(qwen|arena)/'],
    reason: '브라우저는 사이트 조작만 소유한다',
  },
  {
    files: `${src}/counterpush/learning/**`,
    forbidden: [trophy, '^\\.\\./(browser|match|evaluation|loop)/', '(^|/)arena/'],
    reason: '학습 자료 준비는 저장된 기록만 읽고 브라우저를 열지 않는다',
  },
  {
    files: `${src}/counterpush/match/**`,
    forbidden: [trophy, '^\\.\\./(learning|evaluation|loop)/', '(^|/)arena/'],
    reason: '경기 한 판은 학습·평가 순서를 알지 못한다',
  },
  {
    files: `${src}/counterpush/evaluation/**`,
    forbidden: [trophy, '^\\.\\./loop/', '(^|/)arena/'],
    reason: '고정 평가는 후보 학습과 채택 반복을 알지 못한다',
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
