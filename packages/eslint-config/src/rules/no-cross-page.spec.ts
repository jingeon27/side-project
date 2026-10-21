import { RuleTester } from '@typescript-eslint/rule-tester';

import type { TFsdOptions } from '../lib/fsd.helper';
import { fixtureRoot, languageOptions, readFixture } from '../test/rule-tester';
import { noCrossPage } from './no-cross-page';

const options: TFsdOptions = [{ srcDir: fixtureRoot('fsd/src') }];

new RuleTester({ languageOptions }).run('no-cross-page', noCrossPage, {
  valid: [
    {
      ...readFixture('fsd/src/_pages/group/@page/LocalHeader.tsx'),
      options,
    },
    { ...readFixture('fsd/src/app/groups/[id]/route.tsx'), options },
  ],
  invalid: [
    {
      ...readFixture('fsd/src/_pages/contest/@page/CrossPage.tsx'),
      options,
      errors: [{ messageId: 'crossPage' }],
    },
  ],
});
