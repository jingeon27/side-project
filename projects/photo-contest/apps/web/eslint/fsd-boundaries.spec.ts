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
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { cn } from '@/shared/lib/cn.helper';",
    },
    {
      filename: file('_pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { BottomNav } from '@/widgets/bottom-nav';",
    },
    {
      filename: file('_app/providers/AppProviders.tsx'),
      code: "import { groupTypePolicies } from '@/features/group';",
    },
    {
      filename: file('shared/ui/@core/button/Button.tsx'),
      code: "import { cn } from '../../../lib/cn.helper';",
    },
    {
      filename: file('app/groups/[id]/page.tsx'),
      code: "import { GroupPage } from '@/_pages/group';",
    },
    { filename: file('app/layout.tsx'), code: "import '@/_app/styles/tailwind.css';" },
    {
      filename: file('app/groups/[id]/page.tsx'),
      code: "import { PreloadQuery } from '@/shared/api/apollo-client.server';",
    },
    {
      filename: file('proxy.ts'),
      code: "import { decideAuthGate } from '@/shared/lib/auth-gate.helper';",
    },
    {
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { useQuery } from '@apollo/client/react';",
    },
  ],
  invalid: [
    {
      filename: file('shared/lib/x.helper.ts'),
      code: "import { submissionTypePolicies } from '@/features/submission';",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { BottomNav } from '../../../widgets/bottom-nav';",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('widgets/bottom-nav/ui/BottomNav.tsx'),
      code: "export { HomePage } from '@/_pages/home';",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('_pages/home/@page/HomePageTemplate.tsx'),
      code: "const providers = import('@/_app/providers');",
      errors: [{ messageId: 'upward' }],
    },
    {
      filename: file('app/page.tsx'),
      code: "import { CreateGroupBottomSheet } from '@/features/group';",
      errors: [{ messageId: 'route' }],
    },
  ],
});

ruleTester.run('slice-public-api', plugin.rules['slice-public-api'], {
  valid: [
    {
      filename: file('_pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupBanner } from '@/features/group';",
    },
    {
      filename: file('_pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupBanner } from '@/features/group/index';",
    },
    {
      filename: file('features/contest/ui/ContestCard.tsx'),
      code: "import type { TGroupRole } from '@/features/group/types/group.type';",
    },
    {
      filename: file('features/contest/ui/ContestCard.spec.tsx'),
      code: "import { groupMock } from '@/features/group/mocks/group.mock';",
    },
    {
      filename: file('_pages/group/@page/model/x.ts'),
      code: "import { createGroupSchema } from '@/features/group/model/group.schema';",
    },
    {
      filename: file('_pages/group/@page/GroupPage.tsx'),
      code: "import { loadGroup } from '@/features/group/api/group.server';",
    },
    {
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { groupTypePolicies } from '../model/group.type-policies';",
    },
    {
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { Button } from '@/shared/ui/@core/button';",
    },
  ],
  invalid: [
    {
      filename: file('_pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupBanner } from '@/features/group/ui/GroupBanner';",
      errors: [{ messageId: 'deep' }],
    },
    {
      filename: file('features/contest/ui/ContestCard.tsx'),
      code: "import { groupTypePolicies } from '../../group/model/group.type-policies';",
      errors: [{ messageId: 'deep' }],
    },
    {
      filename: file('_app/providers/AppProviders.tsx'),
      code: "export { BottomNav } from '@/widgets/bottom-nav/ui/BottomNav';",
      errors: [{ messageId: 'deep' }],
    },
    {
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { groupTypePolicies } from '@/features/group';",
      errors: [{ messageId: 'ownBarrel' }],
    },
    {
      filename: file('features/group/ui/GroupCard.tsx'),
      code: "import { groupTypePolicies } from '..';",
      errors: [{ messageId: 'ownBarrel' }],
    },
  ],
});

ruleTester.run('no-cross-page', plugin.rules['no-cross-page'], {
  valid: [
    {
      filename: file('_pages/group/@page/GroupPageTemplate.tsx'),
      code: "import { GroupHeader } from './ui/GroupHeader';",
    },
    {
      filename: file('app/groups/[id]/page.tsx'),
      code: "import { GroupPage } from '@/_pages/group';",
    },
  ],
  invalid: [
    {
      filename: file('_pages/contest/@page/ContestPageTemplate.tsx'),
      code: "import { GroupPage } from '@/_pages/group';",
      errors: [{ messageId: 'crossPage' }],
    },
  ],
});
