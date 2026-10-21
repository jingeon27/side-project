import { z } from 'zod';

/** OAuth 목적지는 같은 서비스의 언어 경로로 제한한다. 화면별 복귀 문맥은 웹 라우터가 검증한다. */
export const AuthReturnPathSchema = z
  .string()
  .max(2048)
  .refine((path) => {
    if (!/^\/(ko|en|ja)(?:\/|\?|$)/.test(path) || /[\\#\u0000-\u0020\u007f]/.test(path)) return false;
    const destination = new URL(path, 'https://auth-return.invalid');
    return (
      destination.origin === 'https://auth-return.invalid' &&
      /^\/(ko|en|ja)(?:\/|$)/.test(destination.pathname)
    );
  }, '로그인 후 돌아갈 서비스 경로를 확인해주세요.');
