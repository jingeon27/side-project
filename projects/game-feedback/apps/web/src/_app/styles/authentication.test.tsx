import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

import { SocialLoginForm } from '@/widgets/authentication';

type TSpecificity = [id: number, classLike: number, type: number];

interface IStyleRule {
  selector: string;
  declarations: Map<string, string>;
  media: string[];
  layer: string;
  order: number;
}

// jsdom 환경의 URL은 node:fs가 받지 않으므로 경로 문자열로 바꾼다.
const stylesDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tailwindDir = dirname(require.resolve('tailwindcss/package.json'));
// 앞에 역슬래시가 없을 때만 가상 클래스다. `hover\:bg-sunken`처럼 클래스 이름 안의 글자는 뺀다.
const statePseudo = /(?<!\\):(hover|active)(?![\w-])/g;
const leadingClass = /^\.(?:\\.|[\w-])+/;
const parens = String.raw`\((?:\\.|[^()\\]|\((?:\\.|[^()\\]|\((?:\\.|[^()\\])*\))*\))*\)`;
const attribute = String.raw`\[(?:\\.|[^\]\\])*\]`;
const simpleSelectors = new RegExp(String.raw`${attribute}|(#|\.|::|:)?((?:\\.|[\w-])+)(${parens})?`, 'g');
const listItems = new RegExp(String.raw`(?:\\.|${parens}|${attribute}|[^,\\()[\]])+`, 'g');
// `hover:`의 `(hover: hover)`와 임의 변형 `[@media(hover:hover)]:`의 `(hover:hover)`는 같은 조건이다.
const mediaKey = (condition: string) => condition.replace(/\s+/g, '');

function stylesheetPath(id: string, base: string) {
  if (id === 'tailwindcss') return join(tailwindDir, 'index.css');
  if (id.startsWith('@side/')) return require.resolve(id);
  return resolve(base, id);
}

/** 앱 빌드와 같은 진입점(tailwind.css)으로 클래스들이 만드는 CSS를 만든다. */
async function buildCss(classes: string[]) {
  const compiler = await compile(readFileSync(join(stylesDir, 'tailwind.css'), 'utf8'), {
    base: stylesDir,
    async loadStylesheet(id: string, base: string) {
      const path = stylesheetPath(id, base);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler.build(classes);
}

/**
 * 생성 CSS를 규칙 목록으로 펼친다. `@utility`의 중첩 규칙(`&`)은 부모 선택자로 바꾸고 감싼 @layer·@media를 적는다.
 * 클래스 이름 안의 이스케이프한 `\&`(`[&:where(...)]:` 같은 임의 변형)는 선택자가 아니라 글자라서 그대로 둔다.
 */
function flatten(css: string) {
  const blocks: Array<{ prelude: string; selector: string; declarations: string[]; order: number }> = [];
  return [...css.matchAll(/([^{}]*)([{}])/g)].flatMap(([, text = '', brace], order): IStyleRule[] => {
    const parts = text.split(';');
    const prelude = brace === '{' ? (parts.pop() ?? '').trim() : '';
    blocks.at(-1)?.declarations.push(...parts);
    if (brace === '{') {
      const parent = blocks.findLast((block) => block.selector)?.selector ?? '';
      const selector = prelude.startsWith('@') ? '' : prelude.replace(/(?<!\\)&/g, () => parent);
      blocks.push({ prelude, selector, declarations: [], order });
      return [];
    }
    const block = blocks.pop();
    if (!block?.selector) return [];
    // 감싼 at-rule 가운데 `name`(@media·@layer)의 조건들
    const conditions = (name: string) =>
      blocks
        .filter((outer) => outer.prelude.startsWith(name))
        .map((outer) => outer.prelude.slice(name.length).trim());
    const declarations = block.declarations.flatMap((declaration) => {
      const [property = '', ...value] = declaration.split(':');
      return property.trim() ? [[property.trim(), value.join(':').trim()] as const] : [];
    });
    return [
      {
        selector: block.selector,
        declarations: new Map(declarations),
        media: conditions('@media'),
        layer: conditions('@layer')[0] ?? '',
        order: block.order,
      },
    ];
  });
}

function compareSpecificity(left: TSpecificity, right: TSpecificity) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function simpleSpecificity([token, prefix, name = '', args]: RegExpMatchArray): TSpecificity {
  if (prefix === '#') return [1, 0, 0];
  if (prefix === '::' || /^[a-z]/i.test(token)) return [0, 0, 1];
  if (prefix !== ':') return [0, 1, 0];
  if (name === 'where') return [0, 0, 0];
  if (!args || !['not', 'is', 'has'].includes(name)) return [0, 1, 0];
  return [...args.slice(1, -1).matchAll(listItems)]
    .map(([item]) => specificity(item))
    .reduce<TSpecificity>(
      (best, current) => (compareSpecificity(current, best) > 0 ? current : best),
      [0, 0, 0],
    );
}

/** 선택자 하나의 명시도. `:where()`는 0이고 `:not()`·`:is()`·`:has()`는 인자 중 가장 큰 값만 더한다. */
function specificity(selector: string): TSpecificity {
  return [...selector.matchAll(simpleSelectors)]
    .map(simpleSpecificity)
    .reduce<TSpecificity>(
      (total, part) => [total[0] + part[0], total[1] + part[1], total[2] + part[2]],
      [0, 0, 0],
    );
}

/**
 * 버튼에 걸리는 바탕·그림자 규칙. jsdom은 마우스 올림·누름 상태를 만들지 않으므로 그 가상 클래스를 버튼에 잠시 붙인
 * 속성으로 바꿔 확인한다(명시도는 같다). jsdom 29는 `\&`처럼 이스케이프한 &가 든 클래스 이름을 맞추지 못하므로
 * 버튼 자신의 클래스로 시작하는 규칙은 맨 앞 클래스를 `*`로 바꾸고 조건만 본다. 바탕을 정하는 앱·공통 규칙은 모두
 * utilities 레이어에 있고, 그보다 앞서는 것은 레이어 밖 규칙뿐이라 둘만 본다.
 */
async function backgroundRules(button: HTMLElement, pseudo: string[], media: string[]) {
  const rules = flatten(await buildCss(button.className.split(/\s+/))).filter(
    (rule) =>
      ['utilities', ''].includes(rule.layer) &&
      !rule.selector.includes('::') &&
      rule.media.every((condition) => media.map(mediaKey).includes(mediaKey(condition))) &&
      ['background', 'background-color', 'box-shadow'].some((property) => rule.declarations.has(property)),
  );
  for (const name of pseudo) button.setAttribute(`data-css-state-${name}`, '');
  try {
    return rules.filter((rule) => {
      const leading = rule.selector.match(leadingClass)?.[0] ?? '';
      const own = leading !== '' && button.classList.contains(leading.slice(1).replace(/\\(.)/g, '$1'));
      const selector = own ? rule.selector.replace(leadingClass, '*') : rule.selector;
      return button.matches(selector.replace(statePseudo, '[data-css-state-$1]'));
    });
  } finally {
    for (const name of pseudo) button.removeAttribute(`data-css-state-${name}`);
  }
}

/** `properties` 가운데 하나라도 정하는 규칙 중 이기는 값. 레이어 밖, 명시도, 생성 순서 순으로 비교한다. */
function winningValue(rules: IStyleRule[], properties: string[]) {
  const [winner] = rules
    .filter((rule) => properties.some((property) => rule.declarations.has(property)))
    .sort(
      (left, right) =>
        Number(right.layer === '') - Number(left.layer === '') ||
        compareSpecificity(specificity(right.selector), specificity(left.selector)) ||
        right.order - left.order,
    );
  return properties.map((property) => winner?.declarations.get(property)).find(Boolean);
}

describe('소셜 로그인 버튼의 공급자 바탕', () => {
  // 공통 Button(secondary)의 누름 바탕(:active:not([data-disabled]), 0,3,0)이 앱의 hover 규칙과 명시도가 같고
  // 생성 CSS에서 뒤에 나와, 누르는 동안 공급자 색이 회색(sunken)으로 바뀌었다. 터치 기기는 hover 규칙도 걸리지 않았다.
  it.each([
    ['마우스를 올리면', ['hover'], ['(hover: hover)']],
    ['마우스로 누르는 동안', ['hover', 'active'], ['(hover: hover)']],
    ['터치로 누르는 동안', ['active'], []],
  ])('%s 공급자 바탕을 쓰고 안쪽 그림자로 어둡게 보여야 한다', async (_, pseudo, media) => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SocialLoginForm providers={[{ provider: 'kakao', configured: true }]} returnTo="/ko" />
      </QueryClientProvider>,
    );
    const button = screen.getByRole('button', { name: '카카오 로그인' });
    expect(button.getAttribute('data-provider')).toBe('kakao');
    const rules = await backgroundRules(button, pseudo, media);
    // 공통 Button의 회색 hover·누름 바탕 규칙도 함께 걸려 있어야 이 비교가 의미 있다.
    expect(rules.map((rule) => rule.declarations.get('background-color'))).toContain('var(--color-sunken)');
    expect(winningValue(rules, ['background-color', 'background'])).toBe('var(--social-login-background)');
    expect(winningValue(rules, ['box-shadow'])).toBe('inset 0 0 0 100px rgb(0 0 0 / 5%)');
  });
});
