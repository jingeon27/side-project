import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import { noElse } from './no-else';

const fixtures = createFixtures(import.meta.dirname);

new RuleTester({ languageOptions }).run('no-else', noElse, {
  valid: [fixtures.read('valid/guard.ts'), fixtures.read('valid/literal.ts')],
  invalid: [
    { ...fixtures.read('invalid/else.ts'), errors: [{ messageId: 'noElse' }] },
    {
      ...fixtures.read('invalid/chain.ts'),
      errors: [{ messageId: 'noElse' }, { messageId: 'noElse' }],
    },
  ],
});
