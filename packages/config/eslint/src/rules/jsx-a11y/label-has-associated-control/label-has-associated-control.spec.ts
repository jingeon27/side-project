import { createRequire } from 'node:module';

import { RuleTester, type Rule } from 'eslint';

import { labelAssociationOptions } from '../../../react-dom';
import { createFixtures, languageOptions } from '../../../test/rule-tester';

// eslint-plugin-jsx-a11y는 타입 선언이 없는 CommonJS 모듈이다.
const { rules }: { rules: { 'label-has-associated-control': Rule.RuleModule } } = createRequire(
  import.meta.url,
)('eslint-plugin-jsx-a11y');

const fixtures = createFixtures(import.meta.dirname);
const options = [labelAssociationOptions];
const unassociated = 'A form label must be associated with a control.';

new RuleTester({ languageOptions }).run(
  'label-has-associated-control',
  rules['label-has-associated-control'],
  {
    valid: [
      // 디자인 시스템 입력(Input·Checkbox)을 label 안에 두면 연결된다.
      { ...fixtures.read('valid/nested-control.tsx'), options },
      // Label 프리미티브는 htmlFor로 연결한다.
      { ...fixtures.read('valid/label-component.tsx'), options },
    ],
    invalid: [
      { ...fixtures.read('invalid/unknown-control.tsx'), options, errors: [{ message: unassociated }] },
      { ...fixtures.read('invalid/label-component.tsx'), options, errors: [{ message: unassociated }] },
    ],
  },
);
