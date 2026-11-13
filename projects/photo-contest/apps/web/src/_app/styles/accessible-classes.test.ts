import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('../..', import.meta.url));

/** 테스트를 뺀 구현 파일 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(srcDir);

function findAll(pattern: RegExp) {
  return files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(pattern)].map(([match]) => `${relative(srcDir, file)}: ${match}`),
  );
}

/** 공백으로 나눈 클래스 문자열 리터럴. 조건부 cn 인자처럼 한 리터럴 안의 클래스만 함께 본다. */
function classLiterals() {
  return files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/(['"`])((?:(?!\1)[^\n\\])*)\1/g)].map(([, , value = '']) => ({
      file: relative(srcDir, file),
      tokens: value.trim().split(/\s+/),
    })),
  );
}

function descendants(node: ts.Node): ts.Node[] {
  return node.getChildren().flatMap((child) => [child, ...descendants(child)]);
}

// JSX 속성 안의 화살표 함수(=>)와 아이콘 JSX 때문에 정규식으로는 태그가 끝나는 곳을 찾지 못해 구문 트리로 읽는다.
const trees = files.map((file) => ({
  file: relative(srcDir, file),
  nodes: descendants(ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)),
}));

/** 노드 안의 따옴표 문자열과 템플릿 리터럴 조각 */
function literalTexts(node: ts.Node) {
  return [node, ...descendants(node)]
    .filter((child) => ts.isStringLiteral(child) || ts.isTemplateLiteralToken(child))
    .map((child) => child.text);
}

/** 이름으로 찾는 cva 정의의 문자열. className에 cva 결과를 넘기는 컴포넌트(좋아요 토글)도 함께 본다. */
const cvaLiterals = new Map(
  trees.flatMap(({ nodes }) =>
    nodes.flatMap((node) =>
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText() === 'cva'
        ? [[node.name.getText(), literalTexts(node.initializer)] as const]
        : [],
    ),
  ),
);

function jsxElements(...names: string[]) {
  return trees.flatMap(({ file, nodes }) =>
    nodes
      .filter(ts.isJsxOpeningLikeElement)
      .filter((element) => names.includes(element.tagName.getText()))
      .map((element) => ({ file, element })),
  );
}

function attribute(element: ts.JsxOpeningLikeElement, name: string) {
  return element.attributes.properties.filter(ts.isJsxAttribute).find((item) => item.name.getText() === name);
}

/** className 값에 쓴 클래스. 값 안에서 부르는 cva의 문자열까지 펼친다. */
function classTokens(element: ts.JsxOpeningLikeElement) {
  const value = attribute(element, 'className')?.initializer;
  if (!value) return [];
  const called = [value, ...descendants(value)]
    .filter(ts.isCallExpression)
    .flatMap((call) => cvaLiterals.get(call.expression.getText()) ?? []);
  return [...literalTexts(value), ...called].flatMap((text) => text.split(/\s+/)).filter(Boolean);
}

// subtle(#a3a3a3)은 sunken 입력 바탕에서 2.42:1이라 장식 아이콘에만 쓴다. muted는 같은 바탕에서 5.10:1이다.
const subtlePlaceholder = /(?<![\w-])(?:[\w-]+:)*placeholder:text-subtle(?![\w-])/g;
// accent(#ff9b42)는 흰 바탕에서 2.10:1이다. 전역 :focus-visible과 같은 focus-ring 토큰을 쓴다.
const accentFocus = /(?<![\w-])(?:[\w-]+:)*(?:outline|ring)-accent(?![\w-])/g;
// outline-none·outline-hidden은 utilities 레이어라 전역 :focus-visible 링을 지운다. 메뉴 항목처럼 실제 포커스가
// 옮겨 가는 요소에 쓰면 현재 위치가 sunken 강조 배경(흰 팝업과 약 1.04:1)으로만 남는다.
const hiddenOutline = /(?<![\w-])(?:[\w-]+:)*outline-(?:none|hidden)(?![\w-])/g;
// 링 대신 다른 포커스 표시가 있는 곳만 둔다. 새로 쓰면 이 목록과 달라져 실패한다.
const otherFocusIndicators = [
  // 감싼 입력 상자의 focus-within 테두리(ink)
  'features/post/ui/comments/composer/PostCommentComposer.tsx: outline-none',
  'features/post/ui/comments/composer/PostReplyComposer.tsx: outline-none',
  // 포커스를 받는 메뉴 팝업 컨테이너. 항목은 전역 링을 안쪽에 그린다.
  'features/post/ui/card/PostActionsMenu.tsx: outline-none',
  // 입력 자신의 focus 테두리(brand)
  'features/invite/ui/InviteCard.tsx: outline-none',
];
const touchExtension =
  /^(?:[\w-]+:)*(?:before|after):(?:-(?:inset|top|bottom|left|right)-|(?:min-)?(?:h|size)-touch$)/;
// 스크롤 상자(auto·scroll)도 자기 가상 요소를 안쪽 여백 상자에서 자른다.
const overflowClip =
  /^(?:(?!before:|after:)[\w-]+:)*(?:truncate|line-clamp-\d+|overflow(?:-[xy])?-(?:hidden|clip|auto|scroll))$/;
// 버튼 모서리는 shape로 고른다. className으로 덮어써도 렌더 결과의 클래스가 같아 화면 테스트로는 구분하지 못한다.
const shapeRadius = /^(?:[\w-]+:)*rounded-(?:full|control)$/;
// 아바타와 배지는 크기와 위치만 className으로 준다. 글자 크기 토큰(text-caption 등)은 크기라서 뺀다.
const shapeOrColor =
  /^(?:[\w-]+:)*(?:bg-|rounded|border|text-(?!(?:hero|display|title-lg|title|subtitle|body|input|button|label|caption|micro)$))/;

describe('접근성 클래스 규칙', () => {
  it('앱 구현 파일을 모두 검사해야 한다', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('입력 자리표시는 바탕과 4.5:1이 되지 않는 subtle 글자색을 쓰지 않아야 한다', () => {
    expect(findAll(subtlePlaceholder)).toEqual([]);
  });

  it('키보드 포커스 표시는 accent 대신 focus-ring 토큰을 써야 한다', () => {
    expect(findAll(accentFocus)).toEqual([]);
  });

  it('전역 포커스 링은 다른 포커스 표시가 있는 곳에서만 지워야 한다', () => {
    expect(findAll(hiddenOutline).sort()).toEqual([...otherFocusIndicators].sort());
  });

  it('가상 요소로 넓힌 누름 영역은 같은 요소의 넘침 자르기에 잘리지 않아야 한다', () => {
    const clipped = classLiterals()
      .filter(
        ({ tokens }) =>
          tokens.some((token) => touchExtension.test(token)) &&
          tokens.some((token) => overflowClip.test(token)),
      )
      .map(({ file, tokens }) => `${file}: ${tokens.join(' ')}`);
    expect(clipped).toEqual([]);
  });

  // 기본 ▶ 숨김, 44px 누르는 영역, 열림 화살표, 포커스 링은 공통 DisclosureTrigger가 맡는다.
  it('펼침 요소는 공통 DisclosureTrigger를 쓰고 summary를 직접 그리지 않아야 한다', () => {
    expect(jsxElements('summary').map(({ file }) => file)).toEqual([]);
  });
});

describe('공통 컴포넌트 모양 규칙', () => {
  it('검사할 버튼, 아바타, 배지를 구문 트리에서 찾아야 한다', () => {
    expect(jsxElements('Button', 'ButtonLink').length).toBeGreaterThan(50);
    expect(jsxElements('Avatar').length).toBeGreaterThan(5);
    expect(jsxElements('Badge').length).toBeGreaterThan(3);
  });

  it('버튼 모서리는 className 대신 shape로 골라야 한다', () => {
    const radius = jsxElements('Button', 'ButtonLink').flatMap(({ file, element }) =>
      classTokens(element)
        .filter((token) => shapeRadius.test(token))
        .map((token) => `${file}: ${element.tagName.getText()} ${token}`),
    );
    expect(radius).toEqual([]);
  });

  // tone을 빼면 DS 기본값 brand(회색)로 돌아가 그룹(square·outline)과 사람(accent)의 색이 화면마다 갈린다.
  it('아바타는 그룹과 사람에 맞는 tone을 직접 정해야 한다', () => {
    expect(
      jsxElements('Avatar')
        .filter(({ element }) => !attribute(element, 'tone'))
        .map(({ file }) => file),
    ).toEqual([]);
  });

  it('아바타와 배지의 모양과 색은 className으로 덮어쓰지 않아야 한다', () => {
    const overrides = jsxElements('Avatar', 'Badge').flatMap(({ file, element }) =>
      classTokens(element)
        .filter((token) => shapeOrColor.test(token))
        .map((token) => `${file}: ${element.tagName.getText()} ${token}`),
    );
    expect(overrides).toEqual([]);
  });
});
