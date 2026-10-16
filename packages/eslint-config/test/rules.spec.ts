import { readFileSync } from 'node:fs';
import path from 'node:path';

import { RuleTester } from 'eslint';
import type { Rule } from 'eslint';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import { describe, it } from 'vitest';

import { createFsdPlugin } from '../src/fsd.mjs';
import { sidePlugin } from '../src/index.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
const root = path.resolve(import.meta.dirname, 'fixtures');
const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
interface IFixture {
  file: string;
  errors?: RuleTester.InvalidTestCase['errors'];
  options?: RuleTester.ValidTestCase['options'];
}
function runFixtures(directory: string, rules: Record<string, Rule.RuleModule>) {
  const base = path.join(root, directory);
  const cases = JSON.parse(readFileSync(path.join(base, 'cases.json'), 'utf8')) as Record<
    string,
    { valid: IFixture[]; invalid: IFixture[] }
  >;
  for (const [name, fixture] of Object.entries(cases)) {
    const load = ({ file, ...options }: IFixture) => ({
      filename: path.join(base, file),
      code: readFileSync(path.join(base, file), 'utf8'),
      ...options,
    });
    const rule = rules[name];
    if (!rule) throw new Error(`Missing rule: ${name}`);
    tester.run(name, rule, {
      valid: fixture.valid.map(load) as RuleTester.ValidTestCase[],
      invalid: fixture.invalid.map(load) as RuleTester.InvalidTestCase[],
    });
  }
}
runFixtures('fsd', createFsdPlugin(path.join(root, 'fsd/src')).rules);
runFixtures('code', sidePlugin.rules);
runFixtures('react', { 'jsx-handler-names': react.rules['jsx-handler-names'] });
