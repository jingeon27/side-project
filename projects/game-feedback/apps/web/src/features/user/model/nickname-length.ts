import { NicknameSchema } from '@game-feedback/contracts';

function definedLength(value: number | null, name: string) {
  if (value === null) throw new Error(`NicknameSchema must define ${name}.`);
  return value;
}

/** 닉네임 길이는 계약 NicknameSchema가 정한다. 입력 제한·검증·안내 문구가 같은 값을 쓴다. */
export const nicknameLength = {
  min: definedLength(NicknameSchema.minLength, 'a minimum length'),
  max: definedLength(NicknameSchema.maxLength, 'a maximum length'),
};
