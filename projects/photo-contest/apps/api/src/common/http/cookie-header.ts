import { COOKIE_HEADER_MAX_LENGTH } from '../../config/limits';

// RFC 6265 cookie-octet: 제어 문자·공백·DQUOTE·쉼표·세미콜론·백슬래시를 뺀 US-ASCII
const COOKIE_OCTETS = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const SEPARATOR_WHITESPACE = /^[ \t]+|[ \t]+$/g;

function trimWhitespace(value: string) {
  return value.replace(SEPARATOR_WHITESPACE, '');
}

function decodeValue(raw: string) {
  let value = raw;
  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"')) return undefined;
    value = value.slice(1, -1);
  }
  if (!COOKIE_OCTETS.test(value)) return undefined;
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * `Cookie` 요청 헤더 원문에서 name의 값을 꺼낸다.
 * 같은 이름이 여러 번 오면 첫 값만 보고, 그 값이 깨졌으면 뒤의 값으로 넘어가지 않는다.
 * 헤더가 너무 길거나 값의 형식(따옴표·허용 문자·퍼센트 인코딩)이 틀리면 undefined.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header || header.length > COOKIE_HEADER_MAX_LENGTH) return undefined;
  for (const segment of header.split(';')) {
    const pair = trimWhitespace(segment);
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    if (trimWhitespace(pair.slice(0, separator)) !== name) continue;
    const value = decodeValue(trimWhitespace(pair.slice(separator + 1)));
    return value ? value : undefined;
  }
  return undefined;
}
