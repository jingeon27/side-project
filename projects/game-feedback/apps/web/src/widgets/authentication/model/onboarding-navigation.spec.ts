import { describe, expect, it } from 'vitest';

import { appRoutes } from '@game-feedback/bridge';

import { onboardingRedirect } from './onboarding-navigation';

const pending = { needsOnboarding: true, authenticated: false };
const anonymous = { needsOnboarding: false, authenticated: false };
const member = { needsOnboarding: false, authenticated: true };

describe('onboarding session navigation', () => {
  it('moves a newly authenticated native session to its own page and preserves the current filters', () => {
    const destination = '/ja/boards/coaching?coachingRole=STUDENT';
    expect(onboardingRedirect(destination, pending)).toBe(appRoutes.onboarding('ja', destination));
    expect(onboardingRedirect(appRoutes.login('ja', destination), pending)).toBe(
      appRoutes.onboarding('ja', destination),
    );
  });

  it('allows the signup page and legal information to be read while signup is pending', () => {
    for (const path of ['/ko/onboarding', '/ko/terms', '/ko/privacy', '/ko/contact']) {
      expect(onboardingRedirect(path, pending)).toBeNull();
    }
  });

  it('leaves onboarding routing to its page while the current cookie session is revalidated', () => {
    const destination = '/en/posts/post-123?board=coaching';
    const path = appRoutes.onboarding('en', destination);
    expect(onboardingRedirect(path, member)).toBeNull();
    expect(onboardingRedirect(path, anonymous)).toBeNull();
    expect(onboardingRedirect('/ko/onboarding', member)).toBeNull();
  });

  it('leaves ordinary anonymous/member navigation and unsupported paths alone', () => {
    expect(onboardingRedirect('/ko/boards/free', anonymous)).toBeNull();
    expect(onboardingRedirect('/ko/settings', member)).toBeNull();
    for (const path of [
      '/missing',
      appRoutes.onboarding('ko', 'https://outside.test'),
      appRoutes.onboarding('ko', '/en/settings'),
      appRoutes.onboarding('ko', '/ko/login'),
    ]) {
      expect(onboardingRedirect(path, pending)).toBeNull();
    }
  });
});
