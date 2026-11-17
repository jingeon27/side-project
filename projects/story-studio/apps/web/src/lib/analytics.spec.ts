import { afterEach, expect, it, vi } from 'vitest';

import { trackStudioEvent } from './analytics';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@amplitude/analytics-browser', () => ({ createInstance: sdk.create }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('키가 없는 로컬 사용에서는 SDK를 초기화하거나 전송하지 않는다', async () => {
  vi.stubGlobal('window', {});
  vi.stubEnv('NEXT_PUBLIC_STORY_STUDIO_AMPLITUDE_KEY', '');
  await trackStudioEvent('studio_request_clicked', { action: 'plan' });
  await trackStudioEvent('studio_request_succeeded', { action: 'plan' });
  await trackStudioEvent('studio_materials_opened', {});
  await trackStudioEvent('studio_recording_clicked', { action: 'start' });
  await trackStudioEvent('studio_recording_started', { source: 'microphone' });
  await trackStudioEvent('studio_recording_completed', { source: 'microphone' });
  expect(sdk.create).not.toHaveBeenCalled();
});

it('명시적 측정 설정에서만 클릭과 서버 성공을 구분하고 자동 수집을 끈다', async () => {
  vi.stubGlobal('window', {});
  vi.stubEnv('NEXT_PUBLIC_STORY_STUDIO_AMPLITUDE_KEY', 'test-only');
  const client = { init: vi.fn().mockReturnValue({ promise: Promise.resolve() }), track: vi.fn() };
  sdk.create.mockReturnValue(client);
  await trackStudioEvent('studio_request_clicked', { action: 'voice' });
  await trackStudioEvent('studio_request_succeeded', { action: 'voice' });
  await trackStudioEvent('studio_recording_clicked', { action: 'start' });
  await trackStudioEvent('studio_recording_started', { source: 'microphone' });
  await trackStudioEvent('studio_recording_clicked', { action: 'stop' });
  await trackStudioEvent('studio_recording_completed', { source: 'microphone' });
  await trackStudioEvent('studio_request_succeeded', { action: 'voice-upload' });
  expect(client.init).toHaveBeenCalledWith(
    'test-only',
    expect.objectContaining({
      autocapture: false,
      fetchRemoteConfig: false,
      trackingOptions: { ipAddress: false },
    }),
  );
  expect(client.track.mock.calls).toEqual([
    ['studio_request_clicked', { action: 'voice' }],
    ['studio_request_succeeded', { action: 'voice' }],
    ['studio_recording_clicked', { action: 'start' }],
    ['studio_recording_started', { source: 'microphone' }],
    ['studio_recording_clicked', { action: 'stop' }],
    ['studio_recording_completed', { source: 'microphone' }],
    ['studio_request_succeeded', { action: 'voice-upload' }],
  ]);
});
