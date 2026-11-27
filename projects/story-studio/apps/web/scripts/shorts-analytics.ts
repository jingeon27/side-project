import { randomUUID } from 'node:crypto';

import dayjs from 'dayjs';

import type { TStudioAction } from '../src/shared/analytics.ts';

type TShortsAction = Extract<TStudioAction, `shorts-${string}`>;

const actions: ReadonlyMap<string, TShortsAction> = new Map([
  ['setup-voice', 'shorts-setup-voice'],
  ['status', 'shorts-status'],
  ['leads', 'shorts-leads'],
  ['capture', 'shorts-capture'],
  ['boards', 'shorts-boards'],
  ['daily', 'shorts-daily'],
  ['render', 'shorts-render'],
  ['render-story', 'shorts-render-story'],
  ['verify', 'shorts-verify'],
  ['youtube-connect', 'shorts-youtube-connect'],
  ['youtube-auto', 'shorts-youtube-auto'],
  ['youtube-upload', 'shorts-youtube-upload'],
  ['youtube-status', 'shorts-youtube-status'],
  ['youtube-disconnect', 'shorts-youtube-disconnect'],
]);

type TRequestEvent = 'studio_request_clicked' | 'studio_request_succeeded';

export async function trackShortsInvocation(command: string, run: () => Promise<number>) {
  const apiKey = process.env.STORY_STUDIO_SHORTS_AMPLITUDE_KEY?.trim();
  const action = actions.get(command);
  if (!apiKey || !action) return run();

  const deviceId = randomUUID();
  const createEvent = (name: TRequestEvent) => ({
    event_type: name,
    event_properties: { action },
    device_id: deviceId,
    insert_id: randomUUID(),
    time: dayjs().valueOf(),
  });
  const events = [createEvent('studio_request_clicked')];

  try {
    const status = await run();
    if (status === 0) events.push(createEvent('studio_request_succeeded'));
    return status;
  } finally {
    try {
      await fetch('https://api2.amplitude.com/2/httpapi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, events }),
        signal: AbortSignal.timeout(800),
      });
    } catch {
      // Optional analytics must not change command results.
    }
  }
}
