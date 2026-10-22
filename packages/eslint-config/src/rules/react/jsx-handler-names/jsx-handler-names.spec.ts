import { RuleTester } from 'eslint';
import react from 'eslint-plugin-react';

import { languageOptions, readFixture } from '../../../test/rule-tester';

new RuleTester({ languageOptions }).run('jsx-handler-names', react.rules['jsx-handler-names'], {
  valid: [
    { ...readFixture('react/inline.tsx'), options: [{ checkInlineFunction: false }] },
    readFixture('react/forwarded.tsx'),
  ],
  invalid: [{ ...readFixture('react/invalid.tsx'), errors: [{ messageId: 'badHandlerName' }] }],
});
