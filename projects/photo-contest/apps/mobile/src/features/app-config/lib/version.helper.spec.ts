import { describe, expect, it } from 'vitest';

import { compareVersions, isUpdateRequired, normalizeVersion, pickAppVersion } from './version.helper';

describe('normalizeVersion', () => {
  it('짧거나 꼬리가 붙은 버전을 x.y.z로 맞춰야 한다', () => {
    expect(normalizeVersion('1.2.3')).toBe('1.2.3');
    expect(normalizeVersion(' 1.2 ')).toBe('1.2.0');
    expect(normalizeVersion('7')).toBe('7.0.0');
    expect(normalizeVersion('1.2.3-beta.1')).toBe('1.2.3');
    expect(normalizeVersion('1.2.3 (45)')).toBe('1.2.3');
    expect(normalizeVersion('01.002.0003')).toBe('1.2.3');
  });

  it('숫자로 시작하지 않으면 null이어야 한다', () => {
    expect(normalizeVersion('v1.2.3')).toBeNull();
    expect(normalizeVersion('')).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
    expect(normalizeVersion(undefined)).toBeNull();
  });
});

describe('pickAppVersion', () => {
  it('앞에서부터 읽을 수 있는 첫 버전을 골라야 한다', () => {
    expect(pickAppVersion('1.4', '1.0.0')).toBe('1.4.0');
    expect(pickAppVersion(null, '1.0.0')).toBe('1.0.0');
    expect(pickAppVersion('unknown', undefined, '2.0.1')).toBe('2.0.1');
    expect(pickAppVersion(null, undefined)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('자리마다 숫자로 비교해야 한다', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('읽을 수 없는 값이 있으면 null이어야 한다', () => {
    expect(compareVersions('latest', '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', '')).toBeNull();
  });
});

describe('isUpdateRequired', () => {
  it('현재 버전이 최소 버전보다 낮을 때만 true여야 한다', () => {
    expect(isUpdateRequired('0.9.9', '1.0.0')).toBe(true);
    expect(isUpdateRequired('1.0.0', '1.0.1')).toBe(true);
    expect(isUpdateRequired('1.0.0', '1.0.0')).toBe(false);
    expect(isUpdateRequired('1.2.0', '1.0.0')).toBe(false);
  });

  it('버전을 읽을 수 없으면 막지 않아야 한다', () => {
    expect(isUpdateRequired('dev', '1.0.0')).toBe(false);
    expect(isUpdateRequired('1.0.0', 'broken')).toBe(false);
  });
});
