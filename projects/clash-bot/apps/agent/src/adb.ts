import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { HEIGHT, WIDTH, type Point, type Rect } from './config.ts';

const execute = promisify(execFile);
export const GAME_PACKAGE = 'com.supercell.clashroyale';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export type Device = { serial: string; status: string };

export async function findAdb(override?: string): Promise<string> {
  if (override) {
    await access(override);
    return override;
  }
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library/Android/sdk'),
  ].filter((value): value is string => Boolean(value));
  const available = await Promise.all(
    candidates.map(async (sdk) => {
      const path = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
      try {
        await access(path);
        return path;
      } catch {
        return null;
      }
    }),
  );
  const path = available.find(Boolean);
  if (path) return path;
  try {
    await execute('adb', ['version'], { timeout: 3000 });
    return 'adb';
  } catch {
    throw new Error('Android platform-tools의 adb를 찾지 못했습니다. --adb 경로를 지정하세요.');
  }
}

export function parseDevices(output: string): Device[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices') && !line.startsWith('*'))
    .map((line) => {
      const [serial, status] = line.split(/\s+/);
      return { serial: serial ?? '', status: status ?? 'unknown' };
    });
}

export async function listDevices(adb: string): Promise<Device[]> {
  const { stdout } = await execute(adb, ['devices', '-l'], { timeout: 5000 });
  return parseDevices(stdout);
}

export async function connectLocalAdb(adb: string, port = 5555): Promise<string> {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('ADB 포트는 1~65535 범위의 정수여야 합니다.');
  const address = `127.0.0.1:${port}`;
  await execute(adb, ['connect', address], { timeout: 5000 });
  const devices = await listDevices(adb);
  if (!devices.some((device) => device.serial === address))
    throw new Error(
      'BlueStacks의 로컬 ADB 연결을 확인하지 못했습니다. Advanced 설정에서 ADB를 켜고 다시 시도하세요.',
    );
  return selectDevice(devices, address);
}

export function selectDevice(devices: Device[], serial?: string): string {
  if (!serial && devices.length > 1)
    throw new Error('기기가 여러 개입니다. --serial로 봇 전용 기기를 선택하세요.');
  const device = serial ? devices.find((item) => item.serial === serial) : devices[0];
  if (!device)
    throw new Error('연결된 Android 기기가 없습니다. 전용 에뮬레이터를 켜거나 USB 기기를 연결하세요.');
  if (device.status === 'unauthorized') throw new Error('기기의 USB 디버깅 승인창에서 이 맥을 허용해주세요.');
  if (device.status !== 'device') throw new Error(`기기가 준비되지 않았습니다 (${device.status}).`);
  return device.serial;
}

export function sourcePoint(point: Point, viewport: Rect): Point {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x >= WIDTH ||
    point.y < 0 ||
    point.y >= HEIGHT
  )
    throw new Error('터치 좌표가 분석 화면을 벗어났습니다.');
  return {
    x: Math.round(viewport.x + (point.x / WIDTH) * viewport.width),
    y: Math.round(viewport.y + (point.y / HEIGHT) * viewport.height),
  };
}

export class AdbDevice {
  readonly adb: string;
  readonly serial: string;
  readonly signal: AbortSignal;
  constructor(adb: string, serial: string, signal: AbortSignal) {
    this.adb = adb;
    this.serial = serial;
    this.signal = signal;
  }

  async command(args: string[]): Promise<Buffer> {
    this.signal.throwIfAborted();
    const { stdout } = await execute(this.adb, ['-s', this.serial, ...args], {
      encoding: 'buffer',
      maxBuffer: 24 * 1024 * 1024,
      timeout: 7000,
      signal: this.signal,
    });
    return stdout;
  }

  async screenshot(): Promise<Buffer> {
    const bytes = await this.command(['exec-out', 'screencap', '-p']);
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE))
      throw new Error('기기에서 정상 PNG 화면을 받지 못했습니다.');
    return bytes;
  }

  async isGameForeground(): Promise<boolean> {
    const output = (await this.command(['shell', 'dumpsys', 'window'])).toString();
    return output
      .split('\n')
      .some(
        (line) =>
          /mCurrentFocus=/.test(line) &&
          new RegExp(`(?:^|\\s)${GAME_PACKAGE.replaceAll('.', '\\.')}\/`).test(line),
      );
  }

  async tap(point: Point): Promise<void> {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0)
      throw new Error('잘못된 터치 좌표입니다.');
    if (!(await this.isGameForeground())) throw new Error('클래시로얄이 앞에 있지 않아 입력을 중단했습니다.');
    this.signal.throwIfAborted();
    await this.command(['shell', 'input', 'tap', String(point.x), String(point.y)]);
  }
}
