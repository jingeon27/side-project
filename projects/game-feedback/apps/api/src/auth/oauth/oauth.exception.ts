import { ApiError } from '../../common/http/api-error';

/** OAuth 경계의 공개 오류 코드와 제공자별 문구를 한곳에서 유지한다. */
export class OAuthException extends ApiError {
  private constructor(status: 502 | 503, code: 'OAUTH_FAILED' | 'OAUTH_NOT_CONFIGURED', message: string) {
    super(status, code, message);
  }

  static notConfigured() {
    return new OAuthException(503, 'OAUTH_NOT_CONFIGURED', '소셜 로그인이 아직 설정되지 않았습니다.');
  }

  static exchangeFailed(provider: string) {
    return new OAuthException(502, 'OAUTH_FAILED', `${provider} 로그인에 실패했습니다. 다시 시도해주세요.`);
  }
}
