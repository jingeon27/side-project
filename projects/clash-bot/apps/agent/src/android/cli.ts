import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { atomicWrite, setupAssets } from '../shared/assets.ts';
import {
  CARD_INFO,
  cardIdSchema,
  DATA_DIR,
  loadProfile,
  profileSchema,
  type Rect,
} from '../shared/config.ts';
import { AdbDevice, connectLocalAdb, findAdb, listDevices, selectDevice } from './device/adb.ts';
import { launchEmulator, prepareEmulator } from './device/emulator.ts';
import { analyze, annotatedScreen, crop, loadTemplates, normalize } from './perception/vision.ts';
import { decide } from './policy/policy.ts';
import { runBot } from './runtime/runner.ts';

const HELP = `Crown Bot — 실제 Android 화면을 보고 카드를 배치하는 경량 봇

명령 (yarn workspace @clash-bot/agent <명령>):
  setup                       카드 참조 이미지와 초기 프로필 준비
  doctor                      연결 기기와 Android 도구 확인
  connect [--port 5555]        BlueStacks의 맥 내부 ADB 연결 (127.0.0.1만 사용)
  emulator [--prepare-only] [--update-runtime]   봇 전용 ARM64 에뮬레이터 준비/실행
  capture [--out 화면.png]    현재 기기 화면 저장
  analyze --image 화면.png    저장한 화면 분석 및 다음 수 제안 (입력 없음)
  observe                     초당 1회 분석 및 제안 기록 (입력 없음)
  play                        실제 카드 선택/배치 입력
  calibrate --viewport x,y,w,h [--image 화면.png]   게임 영역 설정
  learn --card knight --slot 1 --image 화면.png    내 화면으로 카드 참조 학습
  learn --card knight --variant evolved --slot 1 --image 화면.png   추가 그림 등록
  learn --marker --image 화면.png                 대전 중 화면으로 배틀 표시 갱신

공통: --serial emulator-5578 · --profile 프로필.json · --adb 실행파일
루프: --seconds 180 (최대 600) · --interval 1000 (최소 500 ms) · --max-actions 30
중지: Ctrl+C. 게임은 직접 열고 연습 대전을 시작하세요.
기본 덱: 기사 / 아처 / 자이언트 / 머스킷병 / 미니 P.E.K.K.A / 해골 병사 / 파이어 볼 / 화살
`;

function numberOption(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max)
    throw new Error(`${label} 값은 ${min}~${max} 범위의 정수여야 합니다.`);
  return number;
}

function parseRect(value: string): Rect {
  const [x, y, width, height] = value.split(',').map(Number);
  if (
    [x, y, width, height].some((item) => item === undefined || !Number.isInteger(item)) ||
    value.split(',').length !== 4 ||
    x! < 0 ||
    y! < 0 ||
    width! <= 0 ||
    height! <= 0
  )
    throw new Error('영역은 x,y,width,height 형식의 정수로 지정하세요.');
  return { x: x!, y: y!, width: width!, height: height! };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      serial: { type: 'string' },
      profile: { type: 'string' },
      adb: { type: 'string' },
      port: { type: 'string' },
      out: { type: 'string' },
      image: { type: 'string' },
      seconds: { type: 'string' },
      interval: { type: 'string' },
      'max-actions': { type: 'string' },
      viewport: { type: 'string' },
      card: { type: 'string' },
      slot: { type: 'string' },
      marker: { type: 'boolean' },
      variant: { type: 'string' },
      sdk: { type: 'string' },
      'prepare-only': { type: 'boolean' },
      'update-runtime': { type: 'boolean' },
    },
  });
  const command = positionals[0];
  if (!command || values.help) {
    console.log(HELP);
    return;
  }
  const profilePath = resolve(values.profile ?? join(DATA_DIR, 'profile.json'));
  if (command === 'setup') {
    await setupAssets(DATA_DIR, profilePath);
    console.log(`준비 완료. 프로필: ${profilePath}`);
    return;
  }
  if (command === 'emulator') {
    const prepared = await prepareEmulator(DATA_DIR, values.sdk, values['update-runtime']);
    if (values['prepare-only']) {
      console.log(`전용 AVD 준비 완료: ${prepared.avdPath}`);
      return;
    }
    await launchEmulator(prepared);
    return;
  }
  if (command === 'connect') {
    const adb = await findAdb(values.adb);
    const serial = await connectLocalAdb(adb, numberOption(values.port, 5555, 1, 65535, 'port'));
    console.log(`BlueStacks 연결 완료. 이후 명령에 --serial ${serial}을 지정하세요.`);
    return;
  }
  if (command === 'doctor') {
    const adb = await findAdb(values.adb);
    console.log(
      JSON.stringify(
        {
          platform: process.platform,
          architecture: process.arch,
          node: process.version,
          adb,
          devices: await listDevices(adb),
          profilePath,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!['capture', 'analyze', 'observe', 'play', 'calibrate', 'learn'].includes(command))
    throw new Error(`알 수 없는 명령: ${command}\n${HELP}`);
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  const device = async () => {
    const adb = await findAdb(values.adb);
    return new AdbDevice(adb, selectDevice(await listDevices(adb), values.serial), abort.signal);
  };
  if (command === 'capture') {
    const output = resolve(values.out ?? join(DATA_DIR, 'capture.png'));
    await atomicWrite(output, await (await device()).screenshot());
    console.log(`화면 저장: ${output}`);
    return;
  }
  const profile = await loadProfile(profilePath);
  if (command === 'calibrate') {
    if (!values.viewport) throw new Error('--viewport x,y,width,height를 지정하세요.');
    const next = profileSchema.parse({ ...profile, viewport: parseRect(values.viewport) });
    if (values.image) await normalize(await readFile(resolve(values.image)), next);
    await atomicWrite(profilePath, JSON.stringify(next, null, 2) + '\n');
    console.log('게임 영역을 저장했습니다. analyze로 손패와 엘릭서를 확인하세요.');
    return;
  }
  if (command === 'learn') {
    if (!values.image) throw new Error('--image로 대전 중 캡처를 지정하세요.');
    if (values.variant && (!/^[a-z0-9_-]{1,40}$/.test(values.variant) || values.marker))
      throw new Error('--variant는 카드에만 사용하며 영문 소문자·숫자·밑줄·하이픈 1~40자여야 합니다.');
    const { image } = await normalize(await readFile(resolve(values.image)), profile);
    const card = values.marker ? null : cardIdSchema.parse(values.card);
    const rect = values.marker
      ? profile.marker
      : profile.hand[numberOption(values.slot, 1, 1, 4, 'slot') - 1]!;
    const path = values.variant
      ? join(DATA_DIR, 'templates/variants', card!, `${values.variant}.png`)
      : join(DATA_DIR, 'templates', values.marker ? 'battle.png' : `${card}.png`);
    await atomicWrite(path, await crop(image, rect));
    console.log(`화면 참조 저장: ${path}`);
    return;
  }
  const templates = await loadTemplates(DATA_DIR, profile);
  if (command === 'analyze') {
    if (!values.image) throw new Error('--image로 화면 파일을 지정하세요.');
    const bytes = await readFile(resolve(values.image));
    const observation = await analyze(bytes, profile, templates, Date.now());
    if (values.out)
      await atomicWrite(resolve(values.out), await annotatedScreen(bytes, profile, observation));
    console.log(
      JSON.stringify(
        {
          ...observation,
          suggestion: decide(observation, profile, { actions: 0, lastActionAt: -Infinity }, Date.now()),
        },
        null,
        2,
      ),
    );
    return;
  }
  const seconds = numberOption(values.seconds, 180, 1, 600, 'seconds');
  const intervalMs = numberOption(values.interval, 1000, 500, 5000, 'interval');
  const maxActions = numberOption(values['max-actions'], 30, 1, 200, 'max-actions');
  const logDirectory = join(DATA_DIR, 'runs');
  await mkdir(logDirectory, { recursive: true });
  const logPath = join(logDirectory, `${new Date().toISOString().replaceAll(':', '-')}.jsonl`);
  const log = async (event: Record<string, unknown>) => {
    await appendFile(logPath, JSON.stringify(event) + '\n', { mode: 0o600 });
    if (event.type === 'input_sent' || event.type === 'suggested')
      console.log(
        `${event.type === 'input_sent' ? '입력 전송' : '제안'}: ${CARD_INFO[event.card as keyof typeof CARD_INFO].name} — ${event.reason}`,
      );
    if (event.type === 'confirmed') console.log('손패 변경 확인: 카드 사용을 인식했습니다.');
    if (event.type === 'waiting') console.log(event.reason);
  };
  console.log(
    `${command === 'play' ? '실제 입력 모드' : '관찰 모드 (입력 없음)'} · ${intervalMs}ms 간격 · ${seconds}초 · Ctrl+C로 중지`,
  );
  console.log(`기록: ${logPath}`);
  console.log(
    await runBot(await device(), profile, templates, {
      live: command === 'play',
      seconds,
      intervalMs,
      maxActions,
      signal: abort.signal,
      log,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
