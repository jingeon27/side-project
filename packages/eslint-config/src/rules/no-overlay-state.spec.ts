import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions, readFixture } from '../test/rule-tester';
import { noOverlayState } from './no-overlay-state';

new RuleTester({ languageOptions }).run('no-overlay-state', noOverlayState, {
  valid: [
    readFixture('code/no-overlay-state/valid/pagination.tsx'),
    readFixture('code/no-overlay-state/valid/overlay.tsx'),
  ],
  invalid: [
    {
      ...readFixture('code/no-overlay-state/invalid/direct.tsx'),
      errors: [{ messageId: 'overlayState' }, { messageId: 'overlayState' }],
    },
    {
      ...readFixture('code/no-overlay-state/invalid/namespace.tsx'),
      errors: [{ messageId: 'overlayState' }, { messageId: 'overlayState' }],
    },
  ],
});
