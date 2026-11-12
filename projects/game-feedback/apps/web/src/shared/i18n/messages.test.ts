import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { hasMessage } from './messages';

const src = fileURLToPath(new URL('../../', import.meta.url));
const sources = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.(?:spec|test)\.tsx?$/.test(path))
  .map((path) => ({
    path,
    // 주석 속 따옴표를 문구로 읽지 않도록 주석을 먼저 지운다.
    code: readFileSync(`${src}${path}`, 'utf8').replace(/(^|[\s{])\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, '$1$2'),
  }));
const literal = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;

function untranslated(pattern: RegExp, files = sources) {
  return files.flatMap(({ path, code }) =>
    [...code.matchAll(pattern)]
      .map((match) => (match[1] ?? match[2] ?? '').replace(/\\(.)/g, '$1'))
      .filter((message) => /[가-힣]/.test(message) && !hasMessage(message))
      .map((message) => `${path}: ${message}`),
  );
}

// 사전에 없는 문구는 translate가 원문을 그대로 돌려줘서 영어·일본어 화면에 완료 알림과 오류가 한국어로 보였다.
it('has a translation for every Korean literal passed to t() or translate()', () => {
  expect(
    untranslated(new RegExp(String.raw`\b(?:t\(|translate\(\s*[\w.]+\s*,)\s*(?:${literal})`, 'g')),
  ).toEqual([]);
});

// api·model·lib와 앱 연결 모듈의 오류·안내 문구는 표시하는 곳에서 t()로 번역한다.
it('has a translation for Korean copy kept in api, model, lib and native modules', () => {
  const modules = sources.filter(({ path }) => /(?:^|\/)(?:api|model|lib|native)\//.test(path));
  expect(untranslated(new RegExp(literal, 'g'), modules)).toEqual([]);
});

// 제품 문구에는 가운데 점(U+00B7)과 긴 줄표(U+2014)를 쓰지 않는다(ui-design 스킬). 규칙만 두었더니 안내 화면에 다시 들어왔다.
// 일본어 번역의 가운데 점(・, U+30FB)은 일본어 문장 부호라 허용한다.
it('keeps middle dots and em dashes out of JSX copy and the translation dictionaries', () => {
  const copy = sources.filter(
    ({ path }) => path.endsWith('.tsx') || /^shared\/i18n\/(?:\w+-)?messages\.ts$/.test(path),
  );
  expect(
    copy.flatMap(({ path, code }) =>
      [
        ...[...code.matchAll(new RegExp(literal, 'g'))].map((match) => match[1] ?? match[2] ?? ''),
        ...[...code.matchAll(/>([^<>{}]+)</g)].map((match) => match[1] ?? ''),
      ]
        .filter((text) => /[·—]/.test(text))
        .map((text) => `${path}: ${text.trim()}`),
    ),
  ).toEqual([]);
});
