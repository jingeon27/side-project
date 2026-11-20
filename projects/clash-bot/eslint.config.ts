import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

const src = 'apps/agent/src';
// 의존은 shared ← core ← (arena, trophy) ← loop 한 방향이다. core 안은 기반 모듈 ← battle ← placement ← policy
// ← fast 순서이고, arena와 trophy는 서로 가져오지 않는다. loop는 자가개선 감독 프로세스로 모든 계층을 쓸 수 있고
// 어떤 계층도 loop를 가져오지 않는다. 상대 경로의 폴더 이름으로 금지할 계층을 적는다. 한 파일에 여러 항목이 맞으면
// 뒤의 항목이 앞의 것을 대신하므로, 좁은 범위의 항목은 넓은 범위의 금지 목록을 함께 적는다.
const runners = '(^|/)(arena|trophy|loop)/';
const layers: Array<{ files: string; forbidden: string[]; reason: string }> = [
  {
    files: `${src}/shared/**`,
    forbidden: ['(^|/)(core|arena|trophy|loop)/'],
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
    files: `${src}/trophy/**`,
    forbidden: ['(^|/)(arena|loop)/'],
    reason: '트로피의 실전 학습·평가는 자가대국 실행기와 독립적이다',
  },
  {
    files: `${src}/arena/**`,
    forbidden: ['(^|/)(trophy|loop)/'],
    reason: 'arena는 트로피 실전과 독립된 자가대국이다',
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
