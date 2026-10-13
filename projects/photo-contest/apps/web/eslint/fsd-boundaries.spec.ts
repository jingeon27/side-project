import path from 'node:path';

import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';

import plugin from './fsd-boundaries.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const SRC = path.resolve(import.meta.dirname, '../src');
const file = (relative: string) => path.join(SRC, relative);

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('layer-imports', plugin.rules['layer-imports'], {
  valid: [
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { cn } from '@/modules/shared/lib/cn.helper';",
    },
    {
      filename: file('modules/pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { BottomNav } from '@/modules/widgets/bottom-nav';",
    },
    {
      filename: file('modules/app/providers/AppProviders.tsx'),
      code: "import { groupTypePolicies } from '@/modules/features/group';",
    },
    {
      filename: file('modules/shared/ui/@core/button/Button.tsx'),
      code: "import { cn } from '../../../lib/cn.helper';",
    },
    {
      filename: file('app/groups/[id]/page.tsx'),
      code: "import { GroupPage } from '@/modules/pages/group';",
    },
    { filename: file('app/layout.tsx'), code: "import '@/modules/app/styles/tailwind.css';" },
    {
      filename: file('app/groups/[id]/page.tsx'),
      code: "import { PreloadQuery } from '@/modules/shared/api/apollo-client.server';",
    },
    {
      filename: file('proxy.ts'),
      code: "import { decideAuthGate } from '@/modules/shared/lib/auth-gate.helper';",
    },
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { useQuery } from '@apollo/client/react';",
    },
  ],
  invalid: [
    {
      filename: file('modules/shared/lib/x.helper.ts'),
      code: "import { submissionTypePolicies } from '@/modules/features/submission';",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { BottomNav } from '../../../widgets/bottom-nav';",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('modules/widgets/bottom-nav/ui/BottomNav.tsx'),
      code: "export { HomePage } from '@/modules/pages/home';",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('modules/pages/home/@page/HomePageTemplate.tsx'),
      code: "const providers = import('@/modules/app/providers');",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('app/page.tsx'),
      code: "import { CreateGroupBottomSheet } from '@/modules/features/group';",
      errors: [{ messageId: 'route' }],
    },
  ],
});

ruleTester.run('slice-public-api', plugin.rules['slice-public-api'], {
  valid: [
    {
      filename: file('modules/pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupBanner } from '@/modules/features/group';",
    },
    {
      filename: file('modules/pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupBanner } from '@/modules/features/group/index';",
    },
    {
      filename: file('modules/features/contest/ui/ContestCard.tsx'),
      code: "import type { TGroupRole } from '@/modules/features/group/types/group.type';",
    },
    {
      filename: file('modules/features/contest/ui/ContestCard.spec.tsx'),
      code: "import { groupMock } from '@/modules/features/group/mocks/group.mock';",
    },
    {
      filename: file('modules/pages/group/@page/model/x.ts'),
      code: "import { createGroupSchema } from '@/modules/features/group/model/group.schema';",
    },
    {
      filename: file('modules/pages/group/@page/GroupPage.tsx'),
      code: "import { loadGroup } from '@/modules/features/group/api/group.server';",
    },
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { groupTypePolicies } from '../model/group.type-policies';",
    },
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { Button } from '@/modules/shared/ui/@core/button';",
    },
  ],
  invalid: [
    {
      filename: file('modules/pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupBanner } from '@/modules/features/group/ui/GroupBanner';",
      errors: [{ messageId: 'deep' }],
    },
    {
      filename: file('modules/features/contest/ui/ContestCard.tsx'),
      code: "import { groupTypePolicies } from '../../group/model/group.type-policies';",
      errors: [{ messageId: 'deep' }],
    },
    {
      filename: file('modules/app/providers/AppProviders.tsx'),
      code: "export { BottomNav } from '@/modules/widgets/bottom-nav/ui/BottomNav';",
      errors: [{ messageId: 'deep' }],
    },
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { groupTypePolicies } from '@/modules/features/group';",
      errors: [{ messageId: 'ownBarrel' }],
    },
    {
      filename: file('modules/features/group/ui/GroupCard.tsx'),
      code: "import { groupTypePolicies } from '..';",
      errors: [{ messageId: 'ownBarrel' }],
    },
  ],
});

ruleTester.run('no-cross-page', plugin.rules['no-cross-page'], {
  valid: [
    {
      filename: file('modules/pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupHeader } from './ui/GroupHeader';",
    },
    {
      filename: file('app/groups/[id]/page.tsx'),
      code: "import { GroupPage } from '@/modules/pages/group';",
    },
  ],
  invalid: [
    {
      filename: file('modules/pages/contest/@page/ContestPageTemplate.tsx'),
      code: "import { GroupPage } from '@/modules/pages/group';",
      errors: [{ messageId: 'crossPage' }],
    },
  ],
});
