import { randomBytes } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const RUNTIME_SECRET_FILE = resolve(__dirname, '../../../../.data/cache-revalidation.key');

function readSecret(file: string) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}
function validSecret(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Runtime cache credential is invalid.');
  return secret;
}
function createSecret(file: string) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString('hex')}`;
  writeFileSync(temporary, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  try {
    linkSync(temporary, file);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
  } finally {
    unlinkSync(temporary);
  }
  return readFileSync(file, 'utf8');
}

/**
 * 환경변수 설정 없이 API와 Next가 같은 비공개 자격 증명을 쓴다. 생성은 원자적으로 한 번만 한다.
 * 이미 있으면 읽기만 하므로 키를 읽기 전용으로 마운트한 운영 도구 컨테이너(`ops`)에서도 시작한다.
 */
export function ensureRuntimeSecret(file = RUNTIME_SECRET_FILE) {
  return validSecret(readSecret(file) ?? createSecret(file));
}
