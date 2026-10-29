import { describe, expect, it } from 'vitest';

import { resolveSiteUrl } from './site';

describe('multilingual SEO', () => {
  it('requires HTTP(S) URLs without credentials and strips URL parameters', () => {
    expect(resolveSiteUrl(undefined).origin).toBe('http://localhost:3100');
    expect(resolveSiteUrl('https://blog.example.com/path?token=secret#hash').href).toBe(
      'https://blog.example.com/',
    );
    expect(() => resolveSiteUrl('javascript:alert(1)')).toThrow();
    expect(() => resolveSiteUrl('https://user:secret@example.com')).toThrow();
  });
});
