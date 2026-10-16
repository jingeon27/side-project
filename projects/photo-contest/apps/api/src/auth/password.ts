import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { PASSWORD_KEY_BYTES, PASSWORD_SALT_BYTES, PASSWORD_SCRYPT } from '../config/limits';

const FORMAT = 'scrypt-v1';
// 없는 계정도 같은 비용으로 검증해 아이디 존재 여부가 시간 차이로 드러나지 않게 한다.
const DUMMY_HASH = `${FORMAT}$${'00'.repeat(PASSWORD_SALT_BYTES)}$${'00'.repeat(PASSWORD_KEY_BYTES)}`;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, PASSWORD_SCRYPT, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const key = await derive(password, salt);
  return `${FORMAT}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [format, salt, digest] = (stored ?? DUMMY_HASH).split('$');
  if (
    format !== FORMAT ||
    !salt ||
    !digest ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(digest)
  )
    return false;
  const key = await derive(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(key, Buffer.from(digest, 'hex')) && stored !== undefined;
}
