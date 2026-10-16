import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('비밀번호 해시', () => {
  it('같은 비밀번호도 서로 다른 salt로 저장하고 공백·유니코드를 그대로 검증해야 한다', async () => {
    const password = '  기억할 수 있는 나만의 비밀번호 🎈  ';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
  });
  it('존재하지 않는 계정과 알 수 없는 해시 형식은 인증되지 않아야 한다', async () => {
    expect(await verifyPassword('unknown', undefined)).toBe(false);
    expect(await verifyPassword('unknown', 'sha256$insecure')).toBe(false);
  });
});
