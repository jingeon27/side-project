import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { Semaphore } from 'es-toolkit';

import { ERROR_CODE, fail } from '../../common/errors';
import {
  PASSWORD_HASH_CONCURRENCY,
  PASSWORD_HASH_WAITING_LIMIT,
  PASSWORD_KEY_BYTES,
  PASSWORD_SALT_BYTES,
  PASSWORD_SCRYPT,
} from '../../config/limits';

const FORMAT = 'scrypt-v1';
// 없는 계정도 같은 비용으로 검증해 아이디 존재 여부가 시간 차이로 드러나지 않게 한다.
const DUMMY_HASH = `${FORMAT}$${'00'.repeat(PASSWORD_SALT_BYTES)}$${'00'.repeat(PASSWORD_KEY_BYTES)}`;
const BUSY = '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.';

/**
 * scrypt는 한 번에 32MB와 libuv 스레드 하나를 쓴다. 동시에 몰리면 메모리와 다른 I/O가 밀리므로
 * 동시 실행 수를 제한하고, 기다리는 요청이 너무 많으면 바로 거절한다.
 */
class ScryptGate {
  private readonly slots: Semaphore;
  private admitted = 0;

  constructor(
    private readonly capacity: number,
    private readonly waitingLimit: number,
  ) {
    this.slots = new Semaphore(capacity);
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.admitted >= this.capacity + this.waitingLimit) fail(BUSY, ERROR_CODE.RATE_LIMITED);
    this.admitted += 1;
    await this.slots.acquire();
    try {
      return await work();
    } finally {
      this.slots.release();
      this.admitted -= 1;
    }
  }
}

export function createScryptGate(capacity: number, waitingLimit: number) {
  const gate = new ScryptGate(capacity, waitingLimit);
  return <T>(work: () => Promise<T>) => gate.run(work);
}

const scryptGate = createScryptGate(PASSWORD_HASH_CONCURRENCY, PASSWORD_HASH_WAITING_LIMIT);

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return scryptGate(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, PASSWORD_KEY_BYTES, PASSWORD_SCRYPT, (error, key) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(key);
        });
      }),
  );
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
