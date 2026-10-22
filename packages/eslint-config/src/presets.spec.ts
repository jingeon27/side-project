import path from 'node:path';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { baseConfig } from './base';
import { expoConfig } from './expo';
import { nextConfig } from './next';
import { reactConfig } from './react';

// 세 규칙을 모두 어기는 컴포넌트로 preset마다 켜진 side 규칙을 확인한다.
const code = `export function Overlay() {
  const [open, setOpen] = useState(false);
  if (open) setOpen(false);
  else fetch('/upload');
  return null;
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
    ['reactConfig', reactConfig, ['side/no-component-fetch', 'side/no-else']],
    ['nextConfig', nextConfig, ['side/no-component-fetch', 'side/no-else', 'side/no-overlay-state']],
    ['expoConfig', expoConfig, ['side/no-component-fetch', 'side/no-else']],
  ])('%s는 분류 범위의 규칙만 켜고 side 플러그인을 다시 등록해도 충돌하지 않는다', (_, config, rules) => {
    expect(enabledSideRules(config)).toEqual(rules);
  });
});
