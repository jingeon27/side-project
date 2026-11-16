import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { Profile } from '../../shared/config.ts';
import { sourcePoint, type AdbDevice } from '../device/adb.ts';
import { readBattleResult } from '../perception/result.ts';
import { crop, difference, fingerprint, normalize } from '../perception/vision.ts';

// 결과 화면을 확인한 뒤에만 복귀 버튼을 누르고, 로비 버튼이 보일 때까지 다음 매칭을 시작하지 않는다.
export async function returnToLobby(
  device: AdbDevice,
  profile: Profile,
  dataDir: string,
  signal: AbortSignal,
) {
  const first = await normalize(await device.screenshot(), profile);
  if (!(await readBattleResult(first.image)))
    throw new Error('결과 화면을 확인하지 못해 복귀 버튼을 누르지 않았습니다.');
  await device.tap(sourcePoint({ x: 240, y: 594 }, first.viewport));
  const reference = await fingerprint(await readFile(join(dataDir, 'qwen/lobby-button.png')));
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await delay(500, undefined, { signal });
    const current = await normalize(await device.screenshot(), profile);
    if (
      (await device.isGameForeground()) &&
      difference(
        await fingerprint(await crop(current.image, { x: 130, y: 480, width: 110, height: 40 })),
        reference,
      ) < 8
    )
      return;
  }
  throw new Error('로비 복귀를 확인하지 못해 다음 매칭을 멈췄습니다.');
}
