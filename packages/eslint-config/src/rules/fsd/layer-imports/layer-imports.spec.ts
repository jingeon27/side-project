import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import type { TFsdOptions } from '../fsd.helper';
import { layerImports } from './layer-imports';

const fixtures = createFixtures(import.meta.dirname);
const options: TFsdOptions = [{ srcDir: fixtures.root }];

new RuleTester({ languageOptions }).run('layer-imports', layerImports, {
  valid: [
    {
      ...fixtures.read('features/group/ui/GroupCardShared.tsx'),
      options,
    },
    {
      ...fixtures.read('_pages/group/@page/GroupNavigation.tsx'),
      options,
    },
    {
      ...fixtures.read('_app/providers/FeatureProviders.tsx'),
      options,
    },
    {
      ...fixtures.read('shared/ui/@core/button/Button.tsx'),
      options,
    },
    { ...fixtures.read('app/groups/[id]/page.tsx'), options },
    { ...fixtures.read('app/layout.tsx'), options },
    { ...fixtures.read('app/groups/[id]/preload.tsx'), options },
    { ...fixtures.read('proxy.ts'), options },
    {
      ...fixtures.read('features/group/ui/ExternalQuery.tsx'),
      options,
    },
  ],
  invalid: [
    {
      ...fixtures.read('shared/lib/upward-import.helper.ts'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...fixtures.read('features/group/ui/UpwardNavigation.tsx'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...fixtures.read('widgets/bottom-nav/ui/UpwardExport.tsx'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...fixtures.read('_pages/home/@page/UpwardDynamicImport.tsx'),
      options,
      errors: [{ messageId: 'upward' }],
    },
    {
      ...fixtures.read('app/page.tsx'),
      options,
      errors: [{ messageId: 'route' }],
    },
  ],
});
