import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noHashPrivate } from './no-hash-private';

new RuleTester({ languageOptions }).run('no-hash-private', noHashPrivate, {
  valid: [
    'class Queue { private readonly items: string[] = []; private flush() { return this.items; } }',
    'class Counter { constructor(private readonly start: number) {} }',
  ],
  invalid: [
    { code: 'class Queue { #items: string[] = []; }', errors: [{ messageId: 'hashPrivate' }] },
    { code: 'class Queue { static #count = 0; }', errors: [{ messageId: 'hashPrivate' }] },
    { code: 'class Queue { #flush() { return 1; } }', errors: [{ messageId: 'hashPrivate' }] },
    { code: 'class Queue { get #size() { return 1; } }', errors: [{ messageId: 'hashPrivate' }] },
    { code: 'class Queue { accessor #ready = false; }', errors: [{ messageId: 'hashPrivate' }] },
    // 사용처는 선언과 함께 바뀌므로 선언 하나만 보고한다.
    {
      code: 'class Queue { #items = 0; size() { return this.#items; } has(other: object) { return #items in other; } }',
      errors: [{ messageId: 'hashPrivate' }],
    },
  ],
});
