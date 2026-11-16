import { Inject, Injectable, type FactoryProvider } from '@nestjs/common';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { resolveIdentityProviders } from './identity-providers.factory';
import { OAuthException } from './oauth.exception';
import type { TIdentityProviders } from './providers/identity-provider';

export const IDENTITY_PROVIDERS = Symbol('IDENTITY_PROVIDERS');

export const identityProvidersProvider = {
  provide: IDENTITY_PROVIDERS,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): TIdentityProviders =>
    resolveIdentityProviders(config.webOrigin, config.identityProviders, config.identityProvider),
} satisfies FactoryProvider<TIdentityProviders>;

@Injectable()
export class IdentityProviderRegistry {
  constructor(@Inject(IDENTITY_PROVIDERS) private readonly providers: TIdentityProviders) {}

  require(provider: TSocialProvider) {
    const strategy = this.providers[provider];
    if (!strategy) throw OAuthException.notConfigured();
    return strategy;
  }

  configured(provider: TSocialProvider) {
    return !!this.providers[provider];
  }

  availability() {
    return SocialProviderSchema.options.map((provider) => ({
      provider,
      configured: this.configured(provider),
    }));
  }
}
