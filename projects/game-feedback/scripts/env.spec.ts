import { describe, expect, expectTypeOf, it } from 'vitest';

import { environment, resolveEnvironment } from './env';

describe('runtime environment', () => {
  it('preserves inferred URL and mode types when merging environment sources', () => {
    expectTypeOf<ReturnType<typeof environment>>().not.toBeAny();
    expectTypeOf<ReturnType<typeof environment>['DATABASE_URL']>().toEqualTypeOf<string>();
    expectTypeOf<ReturnType<typeof environment>['ENVIRONMENT']>().toEqualTypeOf<
      'development' | 'test' | 'production'
    >();
    expectTypeOf<ReturnType<typeof environment>['NODE_ENV']>().toEqualTypeOf<
      'development' | 'test' | 'production'
    >();
  });

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
