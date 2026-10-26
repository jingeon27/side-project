import { RuleTester } from '@typescript-eslint/rule-tester';
import { RuleTester as EslintRuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
EslintRuleTester.describe = describe;
EslintRuleTester.it = it;
EslintRuleTester.itOnly = it.only;
