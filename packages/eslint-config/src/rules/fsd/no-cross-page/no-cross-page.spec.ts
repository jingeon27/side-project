import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import type { TFsdOptions } from '../fsd.helper';
import { noCrossPage } from './no-cross-page';

const fixtures = createFixtures(import.meta.dirname);
const options: TFsdOptions = [{ srcDir: fixtures.root }];

new RuleTester({ languageOptions }).run('no-cross-page', noCrossPage, {
  valid: [
    {
      ...fixtures.read('_pages/group/@page/LocalHeader.tsx'),
      options,
    },
    { ...fixtures.read('app/groups/[id]/route.tsx'), options },
  ],
  invalid: [
    {
      ...fixtures.read('_pages/contest/@page/CrossPage.tsx'),
      options,
      errors: [{ messageId: 'crossPage' }],
    },
  ],
});
