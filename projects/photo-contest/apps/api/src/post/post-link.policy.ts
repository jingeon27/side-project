import { ERROR_CODE, fail } from '../common/errors';
import { POST_LINK_LIMIT } from '../config/limits';

export function postLink(value: string | null | undefined): string | null {
  const link = value?.trim();
  if (!link) return null;
  try {
    const url = new URL(link);
    // 저장하는 값은 정규화한 href다. 퍼센트 인코딩으로 길어진 주소도 상한 안이어야 한다.
    if (
      url.href.length <= POST_LINK_LIMIT &&
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    // URL 파싱 실패도 입력 필드에서 고칠 수 있는 동일한 오류로 알린다.
  }
  return fail(
    '링크는 http:// 또는 https://로 시작하는 올바른 주소를 2048자 이내로 입력해 주세요.',
    ERROR_CODE.BAD_USER_INPUT,
  );
}
