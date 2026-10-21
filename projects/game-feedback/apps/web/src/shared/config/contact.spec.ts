import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContactEmail } from './contact';

afterEach(() => vi.unstubAllEnvs());

describe('public support contact', () => {
  it('uses the configured public address and rejects invalid mail links', () => {
    vi.stubEnv('NEXT_PUBLIC_GAME_FEEDBACK_CONTACT_EMAIL', ' support@example.com ');
    expect(getContactEmail()).toBe('support@example.com');
    for (const value of ['', 'javascript:alert(1)', 'broken@example.com\nBcc:other@example.com']) {
      vi.stubEnv('NEXT_PUBLIC_GAME_FEEDBACK_CONTACT_EMAIL', value);
      expect(getContactEmail()).toBe('contact@bambyul.com');
    }
  });
});
