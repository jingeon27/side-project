import { describe, expect, expectTypeOf, it } from 'vitest';

import { environment, resolveEnvironment } from './env';

describe('runtime environment', () => {
  it('does not create local S3 settings when the bucket is blank', () => {
    const storage = {
      GF_S3_BUCKET: '',
      GF_S3_REGION: '',
      GF_S3_ENDPOINT: '',
      GF_S3_FORCE_PATH_STYLE: '',
      GF_S3_ACCESS_KEY_ID: '',
      GF_S3_SECRET_ACCESS_KEY: '',
    };
    const resolved = environment(storage);
    for (const [name, value] of Object.entries(storage)) expect(resolved[name]).toBe(value);
  });

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
