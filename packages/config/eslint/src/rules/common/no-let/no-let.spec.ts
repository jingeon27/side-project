import { RuleTester } from '@typescript-eslint/rule-tester';

import { languageOptions } from '../../../test/rule-tester';
import { noLet } from './no-let';

new RuleTester({ languageOptions }).run('no-let', noLet, {
  valid: [
    'const total = items.reduce((sum, item) => sum + item.price, 0);',
    // store·싱글턴처럼 실제로 바뀌는 모듈 상태
    'let depth = 0;\nexport function push() { depth += 1; }',
    'export let current: string | null = null;',
  ],
  invalid: [
    { code: 'function parse() { let body; body = read(); return body; }', errors: [{ messageId: 'noLet' }] },
    { code: 'const read = () => { let value = 0; return value; };', errors: [{ messageId: 'noLet' }] },
    { code: 'class Reader { read() { let value = 0; return value; } }', errors: [{ messageId: 'noLet' }] },
    {
      code: 'function sum() { for (let index = 0; index < 3; index += 1) total(index); }',
      errors: [{ messageId: 'noLet' }],
    },
    // 모듈 최상위라도 반복문과 블록의 let은 상태가 아니라 단계 계산이다.
    { code: 'for (let index = 0; index < 3; index += 1) total(index);', errors: [{ messageId: 'noLet' }] },
    { code: '{ let value = 0; use(value); }', errors: [{ messageId: 'noLet' }] },
  ],
});
