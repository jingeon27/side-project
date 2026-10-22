import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import type { TFsdOptions } from '../fsd.helper';
import { layerImports } from './layer-imports';

const fixtures = createFixtures(import.meta.dirname);
const options: TFsdOptions = [{ srcDir: fixtures.root }];

// 2026-10-22 감사: 방문자가 보지 않던 import 형태로 위 레이어를 가져와도 통과했다.
new RuleTester({ languageOptions }).run('layer-imports 감사 회귀', layerImports, {
  valid: [],
  invalid: [
    {
      ...fixtures.read('shared/lib/upward-template-import.helper.ts'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...fixtures.read('shared/lib/upward-type-import.helper.ts'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...fixtures.read('shared/lib/upward-require.helper.ts'),
      options,
      errors: [{ messageId: 'upward' }, { messageId: 'upward' }],
    },
  ],
});
