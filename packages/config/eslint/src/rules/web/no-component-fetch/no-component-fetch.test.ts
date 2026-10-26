import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import { noComponentFetch } from './no-component-fetch';

const fixtures = createFixtures(import.meta.dirname);
const mutation = { messageId: 'mutation' } as const;

// 2026-10-22 감사: 지역 fetch를 잡고, 계산 속성·self·.call/.apply·별칭 대입은 놓쳤다.
new RuleTester({ languageOptions }).run('no-component-fetch 감사 회귀', noComponentFetch, {
  valid: [fixtures.read('valid/LocalFetch.tsx')],
  invalid: [
    { ...fixtures.read('invalid/Computed.tsx'), errors: [mutation] },
    { ...fixtures.read('invalid/Self.tsx'), errors: [mutation] },
    { ...fixtures.read('invalid/CallApply.tsx'), errors: [mutation, mutation] },
    { ...fixtures.read('invalid/Alias.tsx'), errors: [mutation, mutation] },
  ],
});
