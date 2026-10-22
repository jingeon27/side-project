import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions, readFixture } from '../../../../test/rule-tester';
import { noElse } from './no-else';

new RuleTester({ languageOptions }).run('no-else', noElse, {
  valid: [readFixture('code/no-else/valid/guard.ts'), readFixture('code/no-else/valid/literal.ts')],
  invalid: [
    { ...readFixture('code/no-else/invalid/else.ts'), errors: [{ messageId: 'noElse' }] },
    {
      ...readFixture('code/no-else/invalid/chain.ts'),
      errors: [{ messageId: 'noElse' }, { messageId: 'noElse' }],
    },
  ],
});
