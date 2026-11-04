import qs from 'qs';

const FLAT_QUERY = {
  ignoreQueryPrefix: true,
  depth: 0,
  parseArrays: false,
  arrayLimit: Infinity,
  parameterLimit: Infinity,
} as const satisfies qs.IParseOptions;

/** qs는 값 안의 `]=`를 키 경계로 읽는다. URLSearchParams처럼 첫 `=`만 키와 값을 나누도록 값 쪽 `=`를 미리 인코딩한다. */
function escapeValueEquals(search: string) {
  return search.replace(/=([^&]*)/g, (_, value: string) => `=${value.replaceAll('=', '%3D')}`);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** URLSearchParams.get처럼 읽는다. 같은 키는 첫 값을 쓰고 문자열이 아닌 값은 없는 것으로 본다. */
export function parseSearch(search: string): Record<string, string | undefined> {
  const parsed = qs.parse(escapeValueEquals(search), { ...FLAT_QUERY, duplicates: 'first' });
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => isString(entry[1])),
  );
}

/** URLSearchParams.getAll처럼 키마다 모든 값을 읽는다. 원본 URL을 다시 쓸 때 중복 키를 보존하려고 쓴다. */
export function parseSearchValues(search: string): Record<string, string[]> {
  const parsed = qs.parse(escapeValueEquals(search), { ...FLAT_QUERY, duplicates: 'combine' });
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, [value].flat().filter(isString)]),
  );
}
