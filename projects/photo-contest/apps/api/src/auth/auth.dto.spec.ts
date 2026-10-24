import { describe, expect, it } from 'vitest';

import { createInputValidationPipe } from '../common/input-validation';
import { AppLoginExchangeDto, DevLoginDto, LoginWithPasswordDto, RegisterWithPasswordDto } from './auth.dto';

const pipe = createInputValidationPipe();

describe('인증 DTO', () => {
  it('아이디·닉네임만 정리하고 비밀번호 공백과 유니코드는 보존해야 한다', async () => {
    const password = '  공백도 포함한 비밀번호 2026!  ';
    const result = await pipe.transform(
      { loginId: '  MY_ID ', password, nickname: '  친구  ' },
      {
        type: 'custom',
        metatype: RegisterWithPasswordDto,
      },
    );
    expect(result).toMatchObject({ loginId: 'my_id', password, nickname: '친구' });
  });

  it('잘못된 로그인 입력은 같은 인증 실패로 거절하고 입력값을 응답에 넣지 않아야 한다', async () => {
    for (const value of [
      { loginId: 'x', password: 'secret' },
      { loginId: 'valid', password: '' },
    ]) {
      await expect(
        pipe.transform(value, { type: 'custom', metatype: LoginWithPasswordDto }),
      ).rejects.toMatchObject({
        message: '아이디 또는 비밀번호를 확인해 주세요.',
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
  });

  it('REST 본문의 미등록 필드·배열·숫자는 DTO에 들어오지 않아야 한다', async () => {
    for (const value of [{ nickname: '친구', role: 'ADMIN' }, { nickname: 123 }, [], null]) {
      await expect(pipe.transform(value, { type: 'body', metatype: DevLoginDto })).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
  });

  it('앱 교환 입력의 형식 오류는 같은 403 계약을 유지해야 한다', async () => {
    await expect(
      pipe.transform({ code: 1, verifier: [] }, { type: 'body', metatype: AppLoginExchangeDto }),
    ).rejects.toMatchObject({
      message: '앱 로그인 요청을 확인할 수 없습니다.',
      extensions: { code: 'FORBIDDEN' },
    });
  });
});
