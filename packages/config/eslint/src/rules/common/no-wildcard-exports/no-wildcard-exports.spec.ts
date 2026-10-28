import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noWildcardExports } from './no-wildcard-exports';

new RuleTester({ languageOptions }).run('no-wildcard-exports', noWildcardExports, {
  valid: [
    "export { Button, type IButtonProps } from './button';",
    "export type { Post, Author } from './contracts';",
    "import * as helpers from './helpers'; export { helpers };",
  ],
  invalid: [
    { code: "export * from './button';", errors: [{ messageId: 'explicitExports' }] },
    { code: "export type * from './contracts';", errors: [{ messageId: 'explicitExports' }] },
    { code: "export * as helpers from './helpers';", errors: [{ messageId: 'explicitExports' }] },
    { code: "export type * as Types from './types';", errors: [{ messageId: 'explicitExports' }] },
  ],
});
