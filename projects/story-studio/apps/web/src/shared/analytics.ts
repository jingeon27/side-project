import type { TFormat } from '../features/story/model/story';

export type TStudioAction =
  | 'write'
  | 'continue'
  | 'writing-stop'
  | 'image'
  | 'image-import'
  | 'material-add'
  | 'material-import'
  | 'material-sync'
  | 'material-stop'
  | 'material-delete'
  | 'video'
  | 'video-stop'
  | 'voice'
  | 'compose'
  | 'voice-create'
  | 'voice-upload'
  | 'voice-train'
  | 'voice-resume'
  | 'voice-cancel'
  | 'shorts-setup-voice'
  | 'shorts-status'
  | 'shorts-leads'
  | 'shorts-capture'
  | 'shorts-boards'
  | 'shorts-daily'
  | 'shorts-render'
  | 'shorts-render-story'
  | 'shorts-verify'
  | 'shorts-youtube-connect'
  | 'shorts-youtube-auto'
  | 'shorts-youtube-upload'
  | 'shorts-youtube-status'
  | 'shorts-youtube-disconnect';
export type TStudioSource = 'blank' | 'sample' | 'demo' | TFormat;
type TAnalyticsProperties = {
  landing_start_clicked: { source: TStudioSource };
  studio_menu_toggled: { expanded: boolean };
  studio_format_selected: { format: TFormat };
  studio_export_menu_toggled: { expanded: boolean };
  studio_opened: { source: TStudioSource };
  studio_request_clicked: { action: TStudioAction };
  studio_request_succeeded: { action: TStudioAction };
  studio_recording_clicked: { action: 'start' | 'stop' | 'cancel' };
  studio_recording_started: { source: 'microphone' };
  studio_recording_completed: { source: 'microphone' };
  studio_reference_clicked: { action: 'set' | 'clear' };
  studio_prompt_clicked: { action: 'copy' };
  studio_writing_finished: { status: 'succeeded' | 'failed' | 'cancelled' };
  studio_collection_clicked: { action: 'select' | 'clear' };
  studio_materials_opened: Record<never, never>;
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
