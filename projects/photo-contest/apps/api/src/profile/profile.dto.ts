import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { trimValue } from '../common/input-validation';
import { MAX_UPLOAD_BYTES, TEXT_LIMIT } from '../config/limits';

export class RequestProfileAvatarUploadDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'], { message: 'JPEG·PNG·WebP 사진을 선택해 주세요.' })
  contentType = '';

  @IsInt({ message: '파일 크기를 확인해 주세요.' })
  @Min(1, { message: '빈 파일은 올릴 수 없습니다.' })
  @Max(MAX_UPLOAD_BYTES, { message: '10MB 이하의 사진을 선택해 주세요.' })
  byteSize = 0;
}

export class CompleteProfileAvatarUploadDto {
  @IsString({ message: '업로드 요청을 확인해 주세요.' })
  @Length(1, 64, { message: '업로드 요청을 확인해 주세요.' })
  uploadId = '';
}

export class UpdateMyProfileDto {
  @Transform(trimValue)
  @IsString({ message: '닉네임을 입력해 주세요.' })
  @Length(1, TEXT_LIMIT.NICKNAME, { message: '닉네임은 1~24자로 입력해 주세요.' })
  nickname = '';

  @IsOptional()
  @IsString({ message: '사진 업로드를 확인해 주세요.' })
  @Length(1, 64, { message: '사진 업로드를 확인해 주세요.' })
  avatarId?: string | null;

  @IsOptional()
  @IsBoolean({ message: '사진 삭제 여부를 확인해 주세요.' })
  removeAvatar?: boolean | null;
}

export class CompleteOnboardingDto extends UpdateMyProfileDto {
  @Equals(true, { message: '이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.' })
  acceptedTerms = false;
}
