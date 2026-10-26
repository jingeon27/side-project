import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import type { TFsdOptions } from '../fsd.helper';
import { slicePublicApi } from './slice-public-api';

const fixtures = createFixtures(import.meta.dirname);
const options: TFsdOptions = [{ srcDir: fixtures.root }];

// 2026-10-22 감사: 자기 slice의 서버 배럴과 레이어 루트 배럴(slice 없음)을 놓쳤다.
new RuleTester({ languageOptions }).run('slice-public-api 감사 회귀', slicePublicApi, {
  valid: [],
  invalid: [
    {
      ...fixtures.read('features/group/ui/OwnServerBarrel.tsx'),
      options,
      errors: [{ messageId: 'ownBarrel' }],
    },
    {
      ...fixtures.read('_pages/group/@page/LayerBarrel.tsx'),
      options,
      errors: [{ messageId: 'layerBarrel' }],
    },
  ],
});
