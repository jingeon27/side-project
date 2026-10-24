import { describe, expect, it } from 'vitest';

import { clientAddressKey } from './client-address';

describe('clientAddressKey', () => {
  it('IPv4와 IPv4-mapped IPv6는 같은 주소 키여야 한다', () => {
    expect(clientAddressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientAddressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clientAddressKey('::FFFF:203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv6는 같은 /64 안의 주소를 하나로 묶어야 한다', () => {
    const key = clientAddressKey('2001:db8:1:2::1');
    expect(key).toBe('2001:db8:1:2::/64');
    expect(clientAddressKey('2001:0db8:0001:0002:ffff:eeee:dddd:cccc')).toBe(key);
    expect(clientAddressKey('2001:db8:1:2:abcd::9%eth0')).toBe(key);
    expect(clientAddressKey('2001:db8:1:3::1')).not.toBe(key);
  });

  it('생략 표기와 끝의 IPv4 표기를 펼쳐서 앞 네 그룹을 써야 한다', () => {
    expect(clientAddressKey('::1')).toBe('0:0:0:0::/64');
    expect(clientAddressKey('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(clientAddressKey('64:ff9b::192.0.2.33')).toBe('64:ff9b:0:0::/64');
  });

  it('주소가 없으면 하나의 알 수 없는 키로 모아야 한다', () => {
    expect(clientAddressKey(undefined)).toBe('unknown');
    expect(clientAddressKey('')).toBe('unknown');
  });
});
