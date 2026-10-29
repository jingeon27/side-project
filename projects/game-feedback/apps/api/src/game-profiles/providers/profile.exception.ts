import { ApiError } from '../../common/http/api-error';

export class ProfileException extends ApiError {
  private constructor(status: 404 | 503, code: 'PLAYER_NOT_FOUND' | 'PROFILE_UNAVAILABLE', message: string) {
    super(status, code, message);
  }

  static notConfigured() {
    return new ProfileException(503, 'PROFILE_UNAVAILABLE', '게임 API가 아직 설정되지 않았습니다.');
  }

  static unavailable() {
    return new ProfileException(
      503,
      'PROFILE_UNAVAILABLE',
      '게임 프로필을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
    );
  }

  static playerNotFound() {
    return new ProfileException(404, 'PLAYER_NOT_FOUND', '플레이어를 찾을 수 없습니다.');
  }
}
