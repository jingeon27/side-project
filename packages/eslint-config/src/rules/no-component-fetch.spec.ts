import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions, readFixture } from '../test/rule-tester';
import { noComponentFetch } from './no-component-fetch';

new RuleTester({ languageOptions }).run('no-component-fetch', noComponentFetch, {
  valid: [
    readFixture('code/no-component-fetch/valid/request.ts'),
    readFixture('code/no-component-fetch/valid/Component.tsx'),
  ],
  invalid: [
    { ...readFixture('code/no-component-fetch/invalid/Fetch.tsx'), errors: [{ messageId: 'mutation' }] },
    { ...readFixture('code/no-component-fetch/invalid/Window.tsx'), errors: [{ messageId: 'mutation' }] },
  ],
});
