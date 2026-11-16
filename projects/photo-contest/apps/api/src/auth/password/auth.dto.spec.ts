import { describe, expect, it } from 'vitest';

import { createInputValidationPipe } from '../../common/input-validation';
import { LoginWithPasswordSchema, RegisterWithPasswordSchema } from './auth.dto';

const pipe = createInputValidationPipe();

describe('인증 DTO', () => {
  it('아이디·닉네임만 정리하고 비밀번호 공백과 유니코드는 보존해야 한다', async () => {
    const password = '  공백도 포함한 비밀번호 2026!  ';
    const result = await pipe.transform(
      { loginId: '  MY_ID ', password, nickname: '  친구  ' },
      {
        type: 'custom',
        schema: RegisterWithPasswordSchema,
      },
    );
    expect(result).toMatchObject({ loginId: 'my_id', password, nickname: '친구' });
  });

  it('가입 비밀번호는 8자를 허용하고 7자는 거절해야 한다', async () => {
    const input = { loginId: 'eight_id', nickname: '경계 확인', password: 'pass1234' };
    await expect(
      pipe.transform(input, { type: 'custom', schema: RegisterWithPasswordSchema }),
    ).resolves.toMatchObject(input);
    await expect(
      pipe.transform(
        { ...input, password: 'pass123' },
        { type: 'custom', schema: RegisterWithPasswordSchema },
      ),
    ).rejects.toMatchObject({
      message: '비밀번호는 8자 이상 입력해 주세요.',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('잘못된 로그인 입력은 같은 인증 실패로 거절하고 입력값을 응답에 넣지 않아야 한다', async () => {
    for (const value of [
      { loginId: 'x', password: 'secret' },
      { loginId: 'valid', password: '' },
    ]) {
      await expect(
        createInputValidationPipe(LoginWithPasswordSchema, 'UNAUTHENTICATED').transform(value, {
          type: 'custom',
        }),
      ).rejects.toMatchObject({
        message: '아이디 또는 비밀번호를 확인해 주세요.',
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
  });

  it('REST 본문의 미등록 필드·배열·숫자는 DTO에 들어오지 않아야 한다', async () => {
    for (const value of [{ nickname: '친구', role: 'ADMIN' }, { nickname: 123 }, [], null]) {
      await expect(
        pipe.transform(value, { type: 'body', schema: RegisterWithPasswordSchema }),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
  });
});
