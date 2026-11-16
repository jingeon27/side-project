// Stable exports for existing consumers; implementations live with their owning domains.
export { ApiError } from './common/http/api-error';
export { hash, token } from './common/crypto';
export { COOKIE, cookies, setCookie } from './common/http/cookies';
export { assertOrigin } from './common/http/origin';
export { assertDatabaseUrl } from './database/database-url';
export { encodeCursor, decodeCursor } from './common/pagination';
export type { IdentityProvider } from './auth/oauth/providers/identity-provider';
export { GoogleIdentityProvider } from './auth/oauth/providers/google-identity.provider';
export type { ProfileProvider } from './game-profiles/providers/profile-provider';
export { SupercellProfileProvider } from './game-profiles/providers/supercell-profile.provider';
export { DemoProfileProvider } from './game-profiles/providers/demo-profile.provider';
