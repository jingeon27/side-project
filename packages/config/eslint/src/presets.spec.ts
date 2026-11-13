import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { baseConfig, testOverrides } from './base';
import { expoConfig } from './expo';
import { nextConfig } from './next';
import { reactConfig } from './react';
import { reactDomConfig } from './react-dom';

// 여러 규칙을 함께 어기는 컴포넌트로 preset마다 켜진 side 규칙을 확인한다.
const code = `import { useState } from 'react';
import { useForm } from 'react-hook-form';

export function Overlay() {
  const form = useForm();
  const [submitting] = useState(form.formState.isSubmitting);
  const [requestError] = useState('');
  const [open, setOpen] = useState(false);
  if (open) setOpen(false);
  else fetch('/upload');
  const submit = () => setOpen(true);
  return <button className="text-subtle" onClick={submit}>열기</button>;
}
`;

function enabledSideRules(config: Linter.Config[]) {
  const messages = new Linter({ configType: 'flat' }).verify(code, config, {
    filename: path.join(import.meta.dirname, 'Overlay.tsx'),
  });
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return [
    ...new Set(
      messages
        .filter(({ ruleId }) => ruleId?.startsWith('side/'))
        .map(({ ruleId, messageId }) => `${ruleId}:${messageId}`),
    ),
  ].sort();
}

describe('preset별 side 규칙 배선', () => {
  const baseRules = ['side/no-else:noElse'];
  const reactRules = [
    'side/no-component-fetch:mutation',
    ...baseRules,
    'side/no-form-state-copy:formStateCopy',
  ];
  // className으로 색을 고르는 DOM preset만 subtle 글자색을 막는다.
  const domStyleRules = ['side/no-subtle-text:subtleText'];
  it.each([
    ['baseConfig', baseConfig, baseRules],
    ['reactConfig', reactConfig, reactRules],
    ['reactDomConfig', reactDomConfig, [...reactRules, ...domStyleRules]],
    [
      'nextConfig',
      nextConfig,
      [
        ...reactRules,
        'side/no-overlay-state:overlayState',
        'side/no-request-error-state:requestErrorState',
        ...domStyleRules,
      ],
    ],
    ['expoConfig', expoConfig, reactRules],
  ])('%s는 분류 범위의 규칙만 켜고 side 플러그인을 다시 등록해도 충돌하지 않는다', (_, config, rules) => {
    expect(enabledSideRules(config)).toEqual(rules);
  });
});

// eslint-config-next가 켜지 않는 jsx-a11y recommended 규칙(no-autofocus)으로 preset마다 jsx-a11y가 켜졌는지 확인한다.
const autoFocusCode = `export function Search() {
  return <input aria-label="검색" autoFocus />;
}
`;

function enabledJsxA11yRules(config: Linter.Config[]) {
  // Next가 등록한 jsx-a11y 플러그인을 다른 객체로 다시 등록하면 verify가 `Cannot redefine plugin` 오류를 던진다.
  const messages = new Linter({ configType: 'flat' }).verify(autoFocusCode, config, {
    filename: path.join(import.meta.dirname, 'Search.tsx'),
  });
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return [
    ...new Set(messages.map((message) => message.ruleId).filter((id) => id?.startsWith('jsx-a11y/'))),
  ].sort();
}

describe('preset별 jsx-a11y 배선', () => {
  it.each([
    ['reactConfig', reactConfig, []],
    ['reactDomConfig', reactDomConfig, ['jsx-a11y/no-autofocus']],
    ['nextConfig', nextConfig, ['jsx-a11y/no-autofocus']],
    ['expoConfig', expoConfig, []],
  ])('%s는 React DOM preset에만 jsx-a11y를 켜고 플러그인 재정의 충돌이 없다', (_, config, rules) => {
    expect(enabledJsxA11yRules(config)).toEqual(rules);
  });
});

// 조건부 훅 호출과 빠진 effect 의존성으로 preset마다 훅 규칙이 오류로 켜졌는지 확인한다.
const hooksCode = `import { useEffect, useState } from 'react';

export function Counter({ step, ready }) {
  if (ready) useState(0);
  useEffect(() => {
    document.title = String(step);
  }, []);
  return null;
}
`;

function hookRuleSeverities(config: Linter.Config[]) {
  const messages = new Linter({ configType: 'flat' }).verify(hooksCode, config, {
    filename: path.join(import.meta.dirname, 'Counter.tsx'),
  });
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return Object.fromEntries(
    messages
      .filter(
        ({ ruleId }) => ruleId === 'react-hooks/rules-of-hooks' || ruleId === 'react-hooks/exhaustive-deps',
      )
      .map(({ ruleId, severity }) => [ruleId, severity]),
  );
}

describe('preset별 React 훅 규칙', () => {
  const errors = { 'react-hooks/rules-of-hooks': 2, 'react-hooks/exhaustive-deps': 2 };
  it.each([
    ['reactConfig', reactConfig, {}],
    ['reactDomConfig', reactDomConfig, errors],
    ['nextConfig', nextConfig, errors],
    ['expoConfig', expoConfig, errors],
  ])(
    '%s는 react-hooks를 등록한 preset에서만 훅 규칙을 오류로 켜고 플러그인 재정의 충돌이 없다',
    (_, config, expected) => {
      expect(hookRuleSeverities(config)).toEqual(expected);
    },
  );
});

describe('모든 preset의 명시적 export', () => {
  it.each([
    ['base', baseConfig],
    ['react', reactConfig],
    ['react-dom', reactDomConfig],
    ['next', nextConfig],
    ['expo', expoConfig],
  ])('%s에서도 와일드카드 타입 재수출을 막아야 한다', (_, config) => {
    const messages = new Linter({ configType: 'flat' }).verify("export type * from './contracts';", config, {
      filename: path.join(import.meta.dirname, 'PublicApi.ts'),
    });
    expect(messages.some(({ ruleId }) => ruleId === 'side/no-wildcard-exports')).toBe(true);
  });
});

// 집중 실행이 남으면 forbidOnly가 없는 Playwright 설정은 그 테스트만 돌리고 통과한다.
const focusedTestCode = `test.only('업로드', () => {});
test.describe.only('그룹', () => {});
it.only.each([1])('값 %s', () => {});
`;

function restrictedPropertyCount(config: Linter.Config[], filename: string) {
  return new Linter({ configType: 'flat' })
    .verify(focusedTestCode, config, { filename: path.join(import.meta.dirname, filename) })
    .filter(({ ruleId }) => ruleId === 'no-restricted-properties').length;
}

describe('테스트 파일의 집중 실행 금지', () => {
  it.each([
    ['nextConfig', nextConfig],
    ['expoConfig', expoConfig],
    // design-system과 GF admin은 reactDomConfig 뒤에 testOverrides를 직접 더한다.
    ['reactDomConfig + testOverrides', [...reactDomConfig, ...testOverrides]],
  ])('%s는 테스트 파일의 .only를 모두 막고 일반 파일은 그대로 둬야 한다', (_, config) => {
    expect(restrictedPropertyCount(config, 'e2e/upload.spec.ts')).toBe(3);
    expect(restrictedPropertyCount(config, 'upload.ts')).toBe(0);
  });

  // no-restricted-syntax로 막으면 뒤에 오는 testOverrides가 preset의 같은 규칙 옵션을 테스트 파일에서 지운다.
  it('expoConfig의 enum 금지는 테스트 파일에서도 남아야 한다', () => {
    const messages = new Linter({ configType: 'flat' }).verify('export enum Mode { A }\n', expoConfig, {
      filename: path.join(import.meta.dirname, 'mode.spec.ts'),
    });
    expect(messages.some(({ ruleId }) => ruleId === 'no-restricted-syntax')).toBe(true);
  });
});

describe('README 규칙 표', () => {
  it('preset이 켜는 side 규칙을 모두 적어야 한다', () => {
    const readme = readFileSync(path.join(import.meta.dirname, '../README.md'), 'utf8');
    const rules = [baseConfig, reactConfig, reactDomConfig, nextConfig, expoConfig]
      .flat()
      .flatMap((config) => Object.keys(config.rules ?? {}))
      .filter((rule) => rule.startsWith('side/'));
    expect(rules.length).toBeGreaterThan(0);
    expect([...new Set(rules)].filter((rule) => !readme.includes(`| \`${rule}\``))).toEqual([]);
  });
});

// Next가 등록한 React 플러그인과 공통 옵션의 플러그인 객체가 충돌하지 않는지도 확인한다.
describe('preset별 기존 핸들러 명명 규칙', () => {
  it.each([
    ['react', reactConfig],
    ['react-dom', reactDomConfig],
    ['next', nextConfig],
    ['expo', expoConfig],
  ])('%s는 react/jsx-handler-names를 켠다', (_, config) => {
    const messages = new Linter({ configType: 'flat' }).verify(
      'export function Editor() { return <Button onClick={actions.save} />; }',
      config,
      { filename: path.join(import.meta.dirname, 'Editor.tsx') },
    );
    expect(messages.filter(({ fatal }) => fatal)).toEqual([]);
    expect(messages.some(({ ruleId }) => ruleId === 'react/jsx-handler-names')).toBe(true);
  });
});
