import { RuleTester } from 'eslint';
import react from 'eslint-plugin-react';

import { createFixtures, languageOptions } from '../../../test/rule-tester';

const fixtures = createFixtures(import.meta.dirname);

new RuleTester({ languageOptions }).run('jsx-handler-names', react.rules['jsx-handler-names'], {
  valid: [
    { ...fixtures.read('valid/inline.tsx'), options: [{ checkInlineFunction: false }] },
    fixtures.read('valid/forwarded.tsx'),
  ],
  invalid: [{ ...fixtures.read('invalid/unprefixed.tsx'), errors: [{ messageId: 'badHandlerName' }] }],
});
