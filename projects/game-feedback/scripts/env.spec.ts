import { describe, expect, it } from 'vitest';

import { resolveEnvironment } from './env.mjs';

describe('runtime environment', () => {
  it('derives the framework mode from the single environment setting', () => {
    for (const value of ['development', 'test', 'production'])
      expect(resolveEnvironment({ ENVIRONMENT: value, NODE_ENV: 'development' })).toEqual({
        ENVIRONMENT: value,
        NODE_ENV: value,
      });
    expect(resolveEnvironment()).toEqual({ ENVIRONMENT: 'development', NODE_ENV: 'development' });
    expect(() => resolveEnvironment({ ENVIRONMENT: 'typo' })).toThrow('ENVIRONMENT');
  });

  it('lets an internal test or build override the configured local mode', () => {
    expect(resolveEnvironment({ ENVIRONMENT: 'test' }, { ENVIRONMENT: 'development' })).toEqual({
      ENVIRONMENT: 'test',
      NODE_ENV: 'test',
    });
  });
});
