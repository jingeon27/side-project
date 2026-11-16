import type { TFormat } from './story';

export type TStudioAction =
  | 'draft'
  | 'continue'
  | 'image'
  | 'video'
  | 'voice'
  | 'compose'
  | 'voice-create'
  | 'voice-upload'
  | 'voice-train'
  | 'voice-resume'
  | 'voice-cancel';
export type TStudioSource = 'blank' | 'sample' | 'demo' | TFormat;
type TAnalyticsProperties = {
  landing_start_clicked: { source: TStudioSource };
  studio_opened: { source: TStudioSource };
  studio_request_clicked: { action: TStudioAction };
  studio_request_succeeded: { action: TStudioAction };
  studio_recording_clicked: { action: 'start' | 'stop' | 'cancel' };
  studio_recording_started: { source: 'microphone' };
  studio_recording_completed: { source: 'microphone' };
};
type TClient = ReturnType<(typeof import('@amplitude/analytics-browser'))['createInstance']>;
const connection: { client?: Promise<TClient> } = {};

// Local use has no key: do not even load the optional SDK. Never collect story text or identifiers.
export async function trackStudioEvent<TName extends keyof TAnalyticsProperties>(
  name: TName,
  properties: TAnalyticsProperties[TName],
) {
  const key = process.env.NEXT_PUBLIC_STORY_STUDIO_AMPLITUDE_KEY;
  if (typeof window === 'undefined' || !key?.trim()) return;
  try {
    connection.client ??= (async () => {
      const { createInstance } = await import('@amplitude/analytics-browser');
      const client = createInstance();
      await client.init(key, {
        autocapture: false,
        fetchRemoteConfig: false,
        trackingOptions: { ipAddress: false },
      }).promise;
      return client;
    })();
    const client = await connection.client;
    client.track(name, properties);
  } catch {
    // Optional measurement must never interrupt a local creative task.
  }
}
