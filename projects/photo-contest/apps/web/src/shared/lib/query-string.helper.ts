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

/** URLSearchParams.get처럼 읽는다. 같은 키는 첫 값을 쓰고 문자열이 아닌 값은 없는 것으로 본다. */
export function parseSearch(search: string): Record<string, string | undefined> {
  const parsed = qs.parse(escapeValueEquals(search), { ...FLAT_QUERY, duplicates: 'first' });
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/**
 * 원본 쿼리에서 주어진 키만 바꾼다. 다른 키와 중복 키는 보존하고, 있던 키는 자리를 지키며
 * 새 키는 뒤에 붙인다. null·undefined는 그 키를 지운다.
 */
export function updateSearch(search: string, updates: Record<string, string | null | undefined>) {
  const current = qs.parse(escapeValueEquals(search), { ...FLAT_QUERY, duplicates: 'combine' });
  return qs.stringify(
    { ...current, ...updates },
    { addQueryPrefix: true, arrayFormat: 'repeat', skipNulls: true },
  );
}
