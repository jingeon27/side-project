import type { GameProfile } from '@game-feedback/contracts';

export interface ProfileProvider {
  lookup(playerTag: string): Promise<GameProfile>;
}
