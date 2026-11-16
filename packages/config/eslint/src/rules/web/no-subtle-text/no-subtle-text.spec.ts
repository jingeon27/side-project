import { RuleTester } from '@typescript-eslint/rule-tester';

import { createFixtures, languageOptions } from '../../../test/rule-tester';
import { noSubtleText } from './no-subtle-text';

const fixtures = createFixtures(import.meta.dirname);
const subtleText = { messageId: 'subtleText' } as const;

new RuleTester({ languageOptions }).run('no-subtle-text', noSubtleText, {
  // 알림함 하트·외부 이동(↗)처럼 aria-hidden 장식 아이콘의 className에 직접 쓴 subtle은 허용한다.
  valid: [fixtures.read('valid/decorative-icon.tsx')],
  invalid: [
    // 2026-11-11 디자인 감사: 피식 댓글 입력의 자리표시가 subtle이라 sunken 바탕에서 2.42:1이었다.
    { ...fixtures.read('invalid/placeholder.tsx'), errors: [{ messageId: 'subtlePlaceholder' }] },
    // 보이는 글자, aria-hidden={false}인 아이콘, 요소를 알 수 없는 상수의 subtle은 막는다.
    { ...fixtures.read('invalid/visible-text.tsx'), errors: [subtleText, subtleText, subtleText] },
  ],
});
