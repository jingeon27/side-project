import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { atomicWrite } from '../../shared/assets.ts';

const IMAGE_URL =
  'https://dl.google.com/android/repository/sys-img/google_apis_playstore/arm64-v8a-31_r09-darwin.zip';
const IMAGE_SHA1 = '8a1fa9a050a3894fb65c785d6b536e182be30e7f';
const IMAGE_SIZE = 1468377491;
export const EMULATOR_PORT = 5578;
const RUNTIME_VERSION = '37.2.13';
const RUNTIME_SHA1 = '6c5e61b873e11c7d1d08683bea089f762baee070';

async function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: env ?? process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`에뮬레이터 도구가 종료됐습니다 (${signal ?? code}).`)),
    );
  });
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha1');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

async function localRuntime(dataDir: string, update: boolean): Promise<string | null> {
  const directory = join(dataDir, 'runtime', RUNTIME_VERSION);
  const binary = join(directory, 'emulator/emulator');
  const marker = join(directory, '.ready');
  const ready = await readFile(marker, 'utf8').then(
    (value) => value === RUNTIME_SHA1,
    () => false,
  );
  if (ready) {
    await access(binary);
    return binary;
  }
  if (!update) return null;
  await mkdir(directory, { recursive: true });
  const archive = join(directory, 'runtime.zip');
  const cached = await stat(archive).catch(() => null);
  if (!cached || cached.size !== 416113219 || (await fileHash(archive)) !== RUNTIME_SHA1) {
    console.log(`Google 공식 Android Emulator ${RUNTIME_VERSION} 다운로드 (약 416 MB).`);
    const response = await fetch(
      'https://dl.google.com/android/repository/emulator-darwin_aarch64-16740729.zip',
      { signal: AbortSignal.timeout(10 * 60_000) },
    );
    if (!response.ok || !response.body) throw new Error(`에뮬레이터 다운로드 실패 (${response.status}).`);
    const temporary = `${archive}.part`;
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(temporary),
    );
    if ((await stat(temporary)).size !== 416113219 || (await fileHash(temporary)) !== RUNTIME_SHA1)
      throw new Error('에뮬레이터 체크섬이 일치하지 않습니다.');
    await rename(temporary, archive);
  }
  await run('/usr/bin/unzip', ['-q', '-o', archive, '-d', directory]);
  await access(binary);
  await atomicWrite(marker, RUNTIME_SHA1);
  await unlink(archive);
  return binary;
}

async function downloadImage(dataDir: string): Promise<string> {
  const imageRoot = join(dataDir, 'android-image');
  const imageDir = join(imageRoot, 'arm64-v8a');
  const completionMarker = join(imageRoot, '.ready');
  const ready = await readFile(completionMarker, 'utf8').then(
    (value) => value === IMAGE_SHA1,
    () => false,
  );
  if (ready) return imageDir;
  await mkdir(imageRoot, { recursive: true });
  const archive = join(imageRoot, 'image.zip');
  const cached = await stat(archive).catch(() => null);
  if (!cached || cached.size !== IMAGE_SIZE || (await fileHash(archive)) !== IMAGE_SHA1) {
    console.log('Google 공식 ARM64 Play Store 이미지 다운로드 (약 1.47 GB, 최초 1회).');
    const response = await fetch(IMAGE_URL, { signal: AbortSignal.timeout(20 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`Android 이미지 다운로드 실패 (${response.status}).`);
    const temporary = `${archive}.part`;
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(temporary),
    );
    if ((await stat(temporary)).size !== IMAGE_SIZE || (await fileHash(temporary)) !== IMAGE_SHA1)
      throw new Error('Android 이미지 체크섬이 일치하지 않습니다.');
    await rename(temporary, archive);
  }
  console.log('봇 전용 이미지 압축 해제 중. 기존 Android SDK와 AVD는 보존합니다.');
  await run('/usr/bin/unzip', ['-q', '-o', archive, '-d', imageRoot]);
  for (const file of ['system.img', 'vendor.img', 'ramdisk.img', 'kernel-ranchu']) {
    if ((await stat(join(imageDir, file))).size === 0)
      throw new Error(`Android 이미지 파일이 비어 있습니다: ${file}`);
  }
  await atomicWrite(completionMarker, IMAGE_SHA1);
  await unlink(archive);
  return imageDir;
}

export async function prepareEmulator(
  dataDir: string,
  sdkOverride?: string,
  updateRuntime = false,
): Promise<{ binary: string; args: string[]; env: NodeJS.ProcessEnv; avdPath: string }> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    throw new Error(
      '자동 에뮬레이터 준비는 Apple Silicon 맥을 지원합니다. 다른 환경에서는 Android 기기를 --serial로 연결하세요.',
    );
  const sdk =
    sdkOverride ??
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    join(homedir(), 'Library/Android/sdk');
  const downloadedRuntime = await localRuntime(dataDir, updateRuntime);
  const binary = downloadedRuntime ?? join(sdk, 'emulator/emulator');
  await access(binary);
  const image = await downloadImage(dataDir);
  const avdHome = join(dataDir, 'avd');
  const avdPath = join(avdHome, 'CrownBot.avd');
  await mkdir(avdPath, { recursive: true });
  const config = join(avdPath, 'config.ini');
  const exists = await access(config).then(
    () => true,
    () => false,
  );
  if (!exists) {
    const settings = {
      AvdId: 'CrownBot',
      'avd.ini.displayname': 'Crown Bot · 720×1280',
      'PlayStore.enabled': 'true',
      'abi.type': 'arm64-v8a',
      'hw.cpu.arch': 'arm64',
      'hw.cpu.ncore': '2',
      'hw.ramSize': '2048',
      'hw.lcd.width': '720',
      'hw.lcd.height': '1280',
      'hw.lcd.density': '240',
      'hw.gpu.enabled': 'yes',
      'hw.gpu.mode': 'host',
      'hw.lcd.vsync': '30',
      'hw.keyboard': 'yes',
      'hw.mainKeys': 'no',
      'hw.sdCard': 'no',
      'hw.camera.back': 'none',
      'hw.camera.front': 'none',
      'disk.dataPartition.size': '3G',
      'image.sysdir.1': `${image}/`,
      'tag.id': 'google_apis_playstore',
      'tag.display': 'Google Play',
      'skin.name': '720x1280',
      showDeviceFrame: 'no',
    };
    await atomicWrite(
      config,
      Object.entries(settings)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n',
    );
  }
  await atomicWrite(
    join(avdHome, 'CrownBot.ini'),
    `avd.ini.encoding=UTF-8\npath=${avdPath}\ntarget=android-31\n`,
  );
  return {
    binary,
    avdPath,
    args: [
      '-avd',
      'CrownBot',
      '-port',
      String(EMULATOR_PORT),
      '-memory',
      '2048',
      '-cores',
      '2',
      '-gpu',
      'host',
      '-noaudio',
      '-no-boot-anim',
      '-no-snapshot',
      ...(downloadedRuntime ? ['-no-metrics'] : []),
    ],
    env: {
      ...process.env,
      ANDROID_AVD_HOME: avdHome,
      ANDROID_EMULATOR_HOME: join(dataDir, 'emulator-home'),
      ANDROID_SDK_ROOT: sdk,
    },
  };
}

export async function launchEmulator(prepared: Awaited<ReturnType<typeof prepareEmulator>>): Promise<void> {
  await mkdir(prepared.env.ANDROID_EMULATOR_HOME!, { recursive: true });
  const portAvailable = await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(EMULATOR_PORT, '127.0.0.1', () => server.close(() => resolve(true)));
  });
  if (!portAvailable)
    throw new Error(`봇 전용 포트 ${EMULATOR_PORT}가 사용 중입니다. 기존 프로세스를 종료하지 않았습니다.`);
  console.log(`CrownBot 실행: RAM 2048 MB · CPU 2개 · 720×1280 · emulator-${EMULATOR_PORT}`);
  await run(prepared.binary, prepared.args, prepared.env);
}
