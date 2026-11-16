import { describe, expect, it } from 'vitest';

import { parseDevices, selectDevice, sourcePoint } from './adb.ts';

describe('explicit Android device routing', () => {
  it('parses ready and unauthorized devices and requires selection with multiple devices', () => {
    const devices = parseDevices(
      'List of devices attached\nemulator-5590 device product:sdk\nphone unauthorized\n',
    );
    expect(() => selectDevice(devices)).toThrow('여러 개');
    expect(selectDevice(devices, 'emulator-5590')).toBe('emulator-5590');
    expect(() => selectDevice(devices, 'phone')).toThrow('승인창');
    expect(() => selectDevice([])).toThrow('없습니다');
  });

  it('transforms reference coordinates through the game viewport and rejects invalid input', () => {
    expect(sourcePoint({ x: 184, y: 326 }, { x: 40, y: 60, width: 720, height: 1280 })).toEqual({
      x: 400,
      y: 700,
    });
    expect(() => sourcePoint({ x: NaN, y: 0 }, { x: 0, y: 0, width: 720, height: 1280 })).toThrow();
    expect(() => sourcePoint({ x: 368, y: 0 }, { x: 0, y: 0, width: 720, height: 1280 })).toThrow();
  });
});
