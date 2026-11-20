import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noNativeDate } from './no-native-date';

new RuleTester({ languageOptions }).run('no-native-date', noNativeDate, {
  valid: [
    "import dayjs from 'dayjs'; const createdAt: Date = dayjs('2026-01-01T00:00:00Z').toDate();",
    'function elapsed(start: Date) { return start.getTime() - performance.now(); }',
    // 지역에서 다시 선언한 Date는 전역 Date가 아니다.
    'function build(Date: new () => object) { return new Date(); }',
    'const Date = { now: () => 0 }; Date.now();',
  ],
  invalid: [
    { code: 'const now = new Date();', errors: [{ messageId: 'nativeDate' }] },
    { code: "const start = new Date('2026-01-01');", errors: [{ messageId: 'nativeDate' }] },
    { code: 'const label = Date();', errors: [{ messageId: 'nativeDate' }] },
    { code: 'const stamp = Date.now();', errors: [{ messageId: 'nativeDate' }] },
    { code: 'const time = Date.parse(value);', errors: [{ messageId: 'nativeDate' }] },
    { code: 'const time = Date.UTC(2026, 0, 1);', errors: [{ messageId: 'nativeDate' }] },
    { code: 'const later = new Date(start.getTime() + 1_000);', errors: [{ messageId: 'nativeDate' }] },
  ],
});
