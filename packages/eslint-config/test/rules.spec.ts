import { readFileSync } from 'node:fs';
import path from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';
import type { TSESLint } from '@typescript-eslint/utils';
import { RuleTester as EslintRuleTester } from 'eslint';
import react from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';

import { createFsdPlugin } from '../src/fsd';
import { sidePlugin } from '../src/index';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
EslintRuleTester.describe = describe;
EslintRuleTester.it = it;
EslintRuleTester.itOnly = it.only;

const root = path.resolve(import.meta.dirname, 'fixtures');
const languageOptions = {
  parser: tseslint.parser,
  ecmaVersion: 'latest',
  sourceType: 'module',
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;
const tester = new RuleTester({ languageOptions });

interface IValidFixture<TOptions extends unknown[]> {
  file: string;
  options?: TOptions;
}
interface IInvalidFixture<TOptions extends unknown[]> extends IValidFixture<TOptions> {
  errors: { messageId: string; data?: Record<string, string> }[];
}
interface IFixtureCases<TOptions extends unknown[]> {
  valid: IValidFixture<TOptions>[];
  invalid: IInvalidFixture<TOptions>[];
}

function readFixtures<TOptions extends unknown[]>(directory: string, name: string) {
  const base = path.join(root, directory);
  const cases = JSON.parse(readFileSync(path.join(base, 'cases.json'), 'utf8')) as Record<
    string,
    IFixtureCases<TOptions>
  >;
  const fixtures = cases[name];
  if (!fixtures) throw new Error(`Missing fixtures: ${directory}/${name}`);
  const load = <TFixture extends { file: string }>({ file, ...options }: TFixture) => ({
    ...options,
    filename: path.join(base, file),
    code: readFileSync(path.join(base, file), 'utf8'),
  });
  return { valid: fixtures.valid.map(load), invalid: fixtures.invalid.map(load) };
}

function runTypedFixtures(directory: string, rules: Record<string, TSESLint.RuleModule<string, []>>) {
  for (const [name, rule] of Object.entries(rules))
    tester.run<string, []>(name, rule, readFixtures<[]>(directory, name));
}
runTypedFixtures('fsd', createFsdPlugin(path.join(root, 'fsd/src')).rules);
runTypedFixtures('code', sidePlugin.rules);
new EslintRuleTester({ languageOptions }).run(
  'jsx-handler-names',
  react.rules['jsx-handler-names'],
  readFixtures<unknown[]>('react', 'jsx-handler-names'),
);
