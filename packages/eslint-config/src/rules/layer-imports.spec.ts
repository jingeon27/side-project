import { RuleTester } from '@typescript-eslint/rule-tester';

import type { TFsdOptions } from '../lib/fsd.helper';
import { fixtureRoot, languageOptions, readFixture } from '../test/rule-tester';
import { layerImports } from './layer-imports';

const options: TFsdOptions = [{ srcDir: fixtureRoot('fsd/src') }];

new RuleTester({ languageOptions }).run('layer-imports', layerImports, {
  valid: [
    {
      ...readFixture('fsd/src/features/group/ui/GroupCardShared.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/_pages/group/@page/GroupNavigation.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/_app/providers/FeatureProviders.tsx'),
      options,
    },
    {
      ...readFixture('fsd/src/shared/ui/@core/button/Button.tsx'),
      options,
    },
    { ...readFixture('fsd/src/app/groups/[id]/page.tsx'), options },
    { ...readFixture('fsd/src/app/layout.tsx'), options },
    { ...readFixture('fsd/src/app/groups/[id]/preload.tsx'), options },
    { ...readFixture('fsd/src/proxy.ts'), options },
    {
      ...readFixture('fsd/src/features/group/ui/ExternalQuery.tsx'),
      options,
    },
  ],
  invalid: [
    {
      ...readFixture('fsd/src/shared/lib/upward-import.helper.ts'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...readFixture('fsd/src/features/group/ui/UpwardNavigation.tsx'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...readFixture('fsd/src/widgets/bottom-nav/ui/UpwardExport.tsx'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...readFixture('fsd/src/_pages/home/@page/UpwardDynamicImport.tsx'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...readFixture('fsd/src/app/page.tsx'),
      options,
      errors: [{ messageId: 'route' }],
    },
  ],
});
