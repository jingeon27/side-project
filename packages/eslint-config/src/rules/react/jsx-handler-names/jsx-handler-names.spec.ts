import { RuleTester } from 'eslint';
import react from 'eslint-plugin-react';

import { jsxHandlerNamesOptions } from '../../../react';
import { createFixtures, languageOptions } from '../../../test/rule-tester';

const fixtures = createFixtures(import.meta.dirname);
// reactConfig가 켜는 옵션 그대로 검증한다.
const options = [jsxHandlerNamesOptions];

new RuleTester({ languageOptions }).run('jsx-handler-names', react.rules['jsx-handler-names'], {
  valid: [
    { ...fixtures.read('valid/inline.tsx'), options },
    { ...fixtures.read('valid/forwarded.tsx'), options },
  ],
  invalid: [
    { ...fixtures.read('invalid/unprefixed.tsx'), options, errors: [{ messageId: 'badHandlerName' }] },
  ],
});
