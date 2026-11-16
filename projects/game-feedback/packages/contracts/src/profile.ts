import { z } from 'zod';

export const NicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N}_ .-]+$/u);

// 공식 문의 계정('운영자')과 그 운영·관리 표기, 탈퇴 표시('탈퇴한 사용자')다. 이름 전체가 같을 때만 막으므로
// 'badminton'이나 '운영테스터'처럼 예약어를 품은 이름은 쓸 수 있다.
const RESERVED_NICKNAMES = new Set([
  '운영자',
  '운영진',
  '운영팀',
  '관리자',
  'admin',
  'administrator',
  'operator',
  '탈퇴한사용자',
]);

/** 전각 문자와 대소문자를 접고 공백, 구분 기호(_ . -), 보이지 않는 문자를 지운 이름이 예약어와 같은지 본다. */
export function isReservedNickname(nickname: string) {
  return RESERVED_NICKNAMES.has(
    nickname
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s_.\p{Default_Ignorable_Code_Point}-]/gu, ''),
  );
}

/**
 * 가입과 데모처럼 닉네임을 새로 정할 때 쓴다. 프로필 저장은 지금 닉네임을 늘 함께 보내므로
 * API가 닉네임이 바뀔 때만 이 규칙을 적용해, 규칙 전에 정한 닉네임으로도 프로필을 저장할 수 있다.
 */
export const NewNicknameSchema = NicknameSchema.refine(
  (value) => !isReservedNickname(value),
  '운영자나 관리자로 보이는 닉네임은 사용할 수 없어요.',
);
export const PROFILE_BIO_MAX_LENGTH = 500;
export const ProfileBioSchema = z.string().trim().max(PROFILE_BIO_MAX_LENGTH);
export const ProfileDetailsInputSchema = z
  .object({ nickname: NicknameSchema, bio: ProfileBioSchema })
  .strict();

export const UpdateProfileInputSchema = ProfileDetailsInputSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
