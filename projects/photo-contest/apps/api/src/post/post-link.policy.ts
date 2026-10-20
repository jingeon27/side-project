import { ERROR_CODE, fail } from '../common/errors';
import { POST_LINK_LIMIT } from '../config/limits';

export function postLink(value: string | null | undefined): string | null {
  const link = value?.trim();
  if (!link) return null;
  try {
    const url = new URL(link);
    if (
      link.length <= POST_LINK_LIMIT &&
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    // URL 파싱 실패도 입력 필드에서 고칠 수 있는 동일한 오류로 알린다.
  }
  return fail('링크는 2048자 이하의 올바른 HTTP·HTTPS 주소로 입력해 주세요.', ERROR_CODE.BAD_USER_INPUT);
}
