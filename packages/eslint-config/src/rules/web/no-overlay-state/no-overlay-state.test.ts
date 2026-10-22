import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import { noOverlayState } from './no-overlay-state';

const fixtures = createFixtures(import.meta.dirname);
const overlayState = { messageId: 'overlayState' } as const;

// 2026-10-22 감사: 별칭·계산 속성·구조분해 없는 호출과 visible·shown·show 이름을 놓치고, 오버레이가 아닌 상태를 잡았다.
new RuleTester({ languageOptions }).run('no-overlay-state 감사 회귀', noOverlayState, {
  valid: [fixtures.read('valid/not-overlay.tsx')],
  invalid: [
    { ...fixtures.read('invalid/alias.tsx'), errors: [overlayState] },
    { ...fixtures.read('invalid/computed.tsx'), errors: [overlayState] },
    { ...fixtures.read('invalid/tuple.tsx'), errors: [overlayState, overlayState] },
    { ...fixtures.read('invalid/names.tsx'), errors: Array.from({ length: 5 }, () => overlayState) },
  ],
});
