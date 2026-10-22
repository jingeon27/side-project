import { RuleTester } from '@typescript-eslint/rule-tester';

import { fixtureRoot, languageOptions, readFixture } from '../../../test/rule-tester';
import type { TFsdOptions } from '../fsd.helper';
import { slicePublicApi } from './slice-public-api';

const options: TFsdOptions = [{ srcDir: fixtureRoot('fsd/src') }];

new RuleTester({ languageOptions }).run('slice-public-api', slicePublicApi, {
  valid: [
    {
      ...readFixture('fsd/src/_pages/group/@page/PublicFeature.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/_pages/group/@page/PublicFeatureIndex.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/features/contest/ui/PublicTypes.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/features/contest/ui/PublicMocks.spec.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/_pages/group/@page/model/public-schema.ts'),
      options,
    },
    {
      ...readFixture('fsd/src/_pages/group/@page/PublicServer.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/features/group/ui/LocalModel.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/features/group/ui/SharedButton.tsx'),
      options,
    },
  ],
  invalid: [
    {
      ...readFixture('fsd/src/_pages/group/@page/PrivateFeature.tsx'),
      options,
      errors: [{ messageId: 'deep' }],
    },
    {
      ...readFixture('fsd/src/features/contest/ui/PrivateRelative.tsx'),
      options,
      errors: [{ messageId: 'deep' }],
    },
    {
      ...readFixture('fsd/src/_app/providers/PrivateExport.tsx'),
      options,
      errors: [{ messageId: 'deep' }],
    },
    {
      ...readFixture('fsd/src/features/group/ui/OwnAliasBarrel.tsx'),
      options,
      errors: [{ messageId: 'ownBarrel' }],
    },
    {
      ...readFixture('fsd/src/features/group/ui/OwnRelativeBarrel.tsx'),
      options,
      errors: [{ messageId: 'ownBarrel' }],
    },
  ],
});
