import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('./', import.meta.url));
const sources = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.(?:spec|test)\.tsx?$/.test(path))
  .map((path) =>
    ts.createSourceFile(path, readFileSync(`${src}${path}`, 'utf8'), ts.ScriptTarget.Latest, true),
  );

function descendants(node: ts.Node): ts.Node[] {
  return node.getChildren().flatMap((child) => [child, ...descendants(child)]);
}

// 주석은 구문 트리의 문자열 노드가 아니라서 따로 지우지 않아도 검사 밖이다. 토스트, 검증 오류, SEO 제목 문구는 .ts에도 있다.
const copy = sources.flatMap((source) =>
  descendants(source)
    .filter((node) => ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node))
    .map((node) => ({ path: source.fileName, kind: node.kind, text: node.text })),
);

describe('제품 문구', () => {
  it('따옴표 문자열, 템플릿 리터럴 조각, JSX 글자를 모두 검사해야 한다', () => {
    expect(sources.length).toBeGreaterThan(100);
    expect([...new Set(copy.map(({ kind }) => kind))]).toEqual(
      expect.arrayContaining([
        ts.SyntaxKind.StringLiteral,
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.JsxText,
      ]),
    );
  });

  // 가운데 점(U+00B7)과 긴 줄표(U+2014)는 쓰지 않는다(ui-design 스킬). 규칙을 둔 직후에도 이용 방법 페이지의 설명에
  // 다시 들어왔다(사진·동영상 공유).
  it('가운데 점과 긴 줄표 없이 써야 한다', () => {
    expect(
      copy.filter(({ text }) => /[·—]/.test(text)).map(({ path, text }) => `${path}: ${text.trim()}`),
    ).toEqual([]);
  });
});
