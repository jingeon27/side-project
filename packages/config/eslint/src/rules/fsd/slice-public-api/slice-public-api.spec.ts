import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import type { TFsdOptions } from '../fsd.helper';
import { slicePublicApi } from './slice-public-api';

const fixtures = createFixtures(import.meta.dirname);
const options: TFsdOptions = [{ srcDir: fixtures.root }];

new RuleTester({ languageOptions }).run('slice-public-api', slicePublicApi, {
  valid: [
    {
      ...fixtures.read('_pages/group/@page/PublicFeature.tsx'),
      options,
    },
    {
      ...fixtures.read('_pages/group/@page/PublicFeatureIndex.tsx'),
      options,
    },
    {
      ...fixtures.read('features/contest/ui/PublicTypes.tsx'),
      options,
    },
    {
      ...fixtures.read('features/contest/ui/PublicMocks.spec.tsx'),
      options,
    },
    {
      ...fixtures.read('_pages/group/@page/model/public-schema.ts'),
      options,
    },
    {
      ...fixtures.read('_pages/group/@page/PublicServer.tsx'),
      options,
    },
    { ...fixtures.read('_pages/group/@page/PublicServerBarrel.tsx'), options },
    {
      ...fixtures.read('features/group/ui/LocalModel.tsx'),
      options,
    },
    {
      ...fixtures.read('features/group/ui/SharedButton.tsx'),
      options,
    },
  ],
  invalid: [
    {
      ...fixtures.read('_pages/group/@page/PrivateFeature.tsx'),
      options,
      errors: [{ messageId: 'deep' }],
    },
    {
      ...fixtures.read('features/contest/ui/PrivateRelative.tsx'),
      options,
      errors: [{ messageId: 'deep' }],
    },
    {
      ...fixtures.read('_app/providers/PrivateExport.tsx'),
      options,
      errors: [{ messageId: 'deep' }],
    },
    {
      ...fixtures.read('features/group/ui/OwnAliasBarrel.tsx'),
      options,
      errors: [{ messageId: 'ownBarrel' }],
    },
    {
      ...fixtures.read('features/group/ui/OwnRelativeBarrel.tsx'),
      options,
      errors: [{ messageId: 'ownBarrel' }],
    },
    { ...fixtures.read('features/group/group.helper.ts'), options, errors: [{ messageId: 'ownBarrel' }] },
    { ...fixtures.read('app/groups/[id]/page.tsx'), options, errors: [{ messageId: 'deep' }] },
  ],
});
