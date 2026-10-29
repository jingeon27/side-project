import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import { handlerNames } from './handler-names';

const fixtures = createFixtures(import.meta.dirname);

new RuleTester({ languageOptions }).run('handler-names', handlerNames, {
  valid: [
    fixtures.read('valid/library.tsx'),
    fixtures.read('valid/handlers.tsx'),
    fixtures.read('valid/helpers.tsx'),
    fixtures.read('valid/shadowed.tsx'),
  ],
  invalid: [
    { ...fixtures.read('invalid/typed.tsx'), errors: [{ messageId: 'handlerName' }] },
    {
      ...fixtures.read('invalid/listeners.ts'),
      errors: [{ messageId: 'handlerName' }, { messageId: 'handlerName' }],
    },
    { ...fixtures.read('invalid/declaration.tsx'), errors: [{ messageId: 'handlerName' }] },
    { ...fixtures.read('invalid/cast.ts'), errors: [{ messageId: 'handlerName' }] },
  ],
});
