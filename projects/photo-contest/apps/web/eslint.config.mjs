// apps/web 전용 ESLint 설정. 프로젝트 공용 설정에 기대지 않는다.
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

import fsdBoundaries from './eslint/fsd-boundaries.mjs';

// `const [open, setOpen] = useState(...)`, `const [error, setError] = useState('')`처럼
// 오버레이 열림·mutation 오류를 컴포넌트 상태로 복제하는 선언(첫 이름이 open/isOpen/…Open, error/…Error)
const OVERLAY_OR_ERROR_STATE = '/^(open|error|\\w+Open|\\w+Error)$/';
const USE_STATE_MESSAGE =
  '오버레이 열림·mutation 오류를 useState로 들고 있지 않습니다. 시트·대화상자는 여는 쪽에서 ' +
  'overlay.open(({ isOpen, close, unmount }) => <XxxBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />)으로 열고 ' +
  'props(IBottomSheetControlProps)로 받으세요. mutation 진행·실패는 useMutation의 loading/error와 공통 ErrorLink 토스트로 처리합니다.';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    '.next/**',
    'next-env.d.ts',
    'src/shared/api/generated.ts',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
  ]),
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    plugins: { fsd: fsdBoundaries },
    rules: {
      'fsd/layer-imports': 'error',
      'fsd/slice-public-api': 'error',
      'fsd/no-cross-page': 'error',
      'react/function-component-definition': [
        'error',
        { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
      ],
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/jsx-pascal-case': 'error',
      'react/jsx-handler-names': ['error', { eventHandlerPrefix: 'handle', eventHandlerPropPrefix: 'on' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: `VariableDeclarator[id.type='ArrayPattern'][id.elements.0.name=${OVERLAY_OR_ERROR_STATE}][init.callee.name='useState']`,
          message: USE_STATE_MESSAGE,
        },
        {
          selector: `VariableDeclarator[id.type='ArrayPattern'][id.elements.0.name=${OVERLAY_OR_ERROR_STATE}][init.callee.property.name='useState']`,
          message: USE_STATE_MESSAGE,
        },
      ],
    },
  },
  {
    // 테스트는 준비 코드에서 값이 있음을 단언할 수 있다.
    files: ['**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}', 'e2e/**', 'vitest.*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
