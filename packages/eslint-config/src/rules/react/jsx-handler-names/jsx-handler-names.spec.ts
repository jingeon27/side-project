import { RuleTester } from 'eslint';
import react from 'eslint-plugin-react';

import { jsxHandlerNamesOptions } from '../../../react';
import { createFixtures, languageOptions } from '../../../test/rule-tester';

const fixtures = createFixtures(import.meta.dirname);
const options = [jsxHandlerNamesOptions];

new RuleTester({ languageOptions }).run('jsx-handler-names', react.rules['jsx-handler-names'], {
  valid: [
    // 한 번 쓰는 핸들러는 인라인으로 둔다.
    { ...fixtures.read('valid/inline.tsx'), options },
    // 분리한 지역 핸들러는 handle*로 이름 짓는다.
    { ...fixtures.read('valid/local-handler.tsx'), options },
    // 받은 props 콜백(on*)은 그대로 넘긴다.
    { ...fixtures.read('valid/forwarded.tsx'), options },
    // 라이브러리 객체의 on* 콜백(RHF field.onChange 등)도 그대로 넘긴다.
    { ...fixtures.read('valid/member.tsx'), options },
  ],
  invalid: [
    { ...fixtures.read('invalid/local.tsx'), options, errors: [{ messageId: 'badHandlerName' }] },
    { ...fixtures.read('invalid/member.tsx'), options, errors: [{ messageId: 'badHandlerName' }] },
    { ...fixtures.read('invalid/unprefixed.tsx'), options, errors: [{ messageId: 'badHandlerName' }] },
    { ...fixtures.read('invalid/prop-key.tsx'), options, errors: [{ messageId: 'badPropKey' }] },
  ],
});
