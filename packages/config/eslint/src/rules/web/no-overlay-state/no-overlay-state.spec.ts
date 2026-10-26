import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import { noOverlayState } from './no-overlay-state';

const fixtures = createFixtures(import.meta.dirname);

new RuleTester({ languageOptions }).run('no-overlay-state', noOverlayState, {
  valid: [fixtures.read('valid/pagination.tsx'), fixtures.read('valid/overlay.tsx')],
  invalid: [
    {
      ...fixtures.read('invalid/direct.tsx'),
      errors: [{ messageId: 'overlayState' }, { messageId: 'overlayState' }],
    },
    {
      ...fixtures.read('invalid/namespace.tsx'),
      errors: [{ messageId: 'overlayState' }, { messageId: 'overlayState' }],
    },
  ],
});
