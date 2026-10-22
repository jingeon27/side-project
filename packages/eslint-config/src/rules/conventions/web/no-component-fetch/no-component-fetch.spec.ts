import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../../test/rule-tester';
import { noComponentFetch } from './no-component-fetch';

const fixtures = createFixtures(import.meta.dirname);

new RuleTester({ languageOptions }).run('no-component-fetch', noComponentFetch, {
  valid: [fixtures.read('valid/request.ts'), fixtures.read('valid/Component.tsx')],
  invalid: [
    { ...fixtures.read('invalid/Fetch.tsx'), errors: [{ messageId: 'mutation' }] },
    { ...fixtures.read('invalid/Window.tsx'), errors: [{ messageId: 'mutation' }] },
  ],
});
