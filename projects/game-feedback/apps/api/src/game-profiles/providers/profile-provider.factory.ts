import type { FactoryProvider } from '@nestjs/common';
import { match, P } from 'ts-pattern';

import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DemoProfileProvider } from './demo-profile.provider';
import type { ProfileProvider } from './profile-provider';
import { SupercellProfileProvider } from './supercell-profile.provider';

export const PROFILE_PROVIDER = Symbol('PROFILE_PROVIDER');

/** 명시적 테스트 제공자 → 데모 → 실제 토큰 → 테스트 인증의 기존 우선순위를 유지한다. */
export const profileProvider = {
  provide: PROFILE_PROVIDER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): ProfileProvider | null => {
    if (config.profileProvider) return config.profileProvider;
    return match({
      demoMode: config.demoMode,
      testAuthEnabled: config.testAuthEnabled,
      supercellToken: process.env.SUPERCELL_API_TOKEN,
    })
      .returnType<ProfileProvider | null>()
      .with({ demoMode: true }, () => new DemoProfileProvider())
      .with(
        { supercellToken: P.string.minLength(1) },
        ({ supercellToken }) => new SupercellProfileProvider(supercellToken),
      )
      .with({ testAuthEnabled: true }, () => new DemoProfileProvider())
      .with({ testAuthEnabled: false }, () => null)
      .exhaustive();
  },
} satisfies FactoryProvider<ProfileProvider | null>;
