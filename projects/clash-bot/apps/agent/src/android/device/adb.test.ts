import { describe, expect, it, vi } from 'vitest';

import { AdbDevice } from './adb.ts';

describe('Android 13 foreground detection', () => {
  it.each([
    ['com.supercell.clashroyale/com.supercell.titan.GameApp', true],
    ['com.android.vending/com.google.android.finsky.playcoreacquisition.PlayCoreAcquisitionActivity', false],
    ['com.supercell.clashroyale.other/MainActivity', false],
    // 패키지 이름의 점은 정규식에서 임의 문자가 아니라 점 그대로 비교한다.
    ['comXsupercellXclashroyale/com.supercell.titan.GameApp', false],
    ['null', false],
  ])('checks the top-level focused window: %s', async (component, expected) => {
    const device = new AdbDevice('unused-adb', '127.0.0.1:5555', new AbortController().signal);
    const command = vi
      .spyOn(device, 'command')
      .mockImplementation(async (args) =>
        Buffer.from(
          args.join(' ') === 'shell dumpsys window'
            ? `mCurrentFocus=Window{b63c190 u0 ${component}}\n`
            : 'Window #0 Window{b63c190 u0 com.supercell.clashroyale/com.supercell.titan.GameApp}\n',
        ),
      );

    expect(await device.isGameForeground()).toBe(expected);
    expect(command).toHaveBeenCalledExactlyOnceWith(['shell', 'dumpsys', 'window']);
  });
});
