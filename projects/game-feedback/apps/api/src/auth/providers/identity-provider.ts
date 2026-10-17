import type { TSocialProvider } from '@game-feedback/contracts';

export interface IdentityProvider {
  authorizationUrl(input: { state: string; nonce: string; challenge: string }): string;
  exchange(code: string, verifier: string, nonce: string): Promise<string>;
}
export type TIdentityProviders = Partial<Record<TSocialProvider, IdentityProvider>>;
