import { hash } from '../common/crypto';

export function socialIdentityHash(provider: string, subject: string) {
  return hash(JSON.stringify([provider, subject]));
}
