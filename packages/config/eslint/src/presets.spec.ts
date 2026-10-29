import path from 'node:path';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { baseConfig } from './base';
import { expoConfig } from './expo';
import { nextConfig } from './next';
import { reactConfig } from './react';
import { reactDomConfig } from './react-dom';

// 네 규칙을 모두 어기는 컴포넌트로 preset마다 켜진 side 규칙을 확인한다.
const code = `export function Overlay() {
  const [open, setOpen] = useState(false);
  if (open) setOpen(false);
  else fetch('/upload');
  const submit = () => setOpen(true);
  return <button onClick={submit}>열기</button>;
}
`;

function enabledSideRules(config: Linter.Config[]) {
  const messages = new Linter({ configType: 'flat' }).verify(code, config, {
    filename: path.join(import.meta.dirname, 'Overlay.tsx'),
  });
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return [
    ...new Set(messages.map((message) => message.ruleId).filter((id) => id?.startsWith('side/'))),
  ].sort();
}

describe('preset별 side 규칙 배선', () => {
  it.each([
    ['baseConfig', baseConfig, ['side/no-else']],
    ['reactConfig', reactConfig, ['side/handler-names', 'side/no-component-fetch', 'side/no-else']],
    [
      'nextConfig',
      nextConfig,
      ['side/handler-names', 'side/no-component-fetch', 'side/no-else', 'side/no-overlay-state'],
    ],
    ['expoConfig', expoConfig, ['side/handler-names', 'side/no-component-fetch', 'side/no-else']],
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
