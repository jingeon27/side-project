import {
  CASE_ID,
  type TCaseStep,
  type TEvidence,
  type TLaunchIntent,
  type TPrinter,
  type TRecordDocument,
  type TRenderer,
} from './case-file';

export type TCaseEntryPoint = 'start' | 'primary' | 'previous' | 'timeline' | 'history' | 'resume' | 'replay';
export type TRecordEntryPoint = 'step' | 'document' | 'primary';
export type TPrinterFlipEntryPoint = 'primary' | 'toolbar';

type TSource = 'youtube_shorts' | 'shared' | 'community' | 'direct';

interface ICaseEvents {
  case_opened: { source: TSource };
  case_landing_viewed: { source: TSource };
  case_landing_cta_clicked: { intent: TLaunchIntent };
  case_landing_link_clicked: { from_step: TCaseStep };
  case_timeline_clicked: { from_step: TCaseStep; to_step: TCaseStep; suggested_next: boolean };
  case_scene_loaded: { renderer: TRenderer; load_bucket: 'under_8s' | '8s_or_more' };
  case_evidence_opened: { clue_id: TEvidence; entry_point: TCaseEntryPoint };
  case_printer_selected: { printer_id: TPrinter; entry_point: 'primary' | 'comparison' };
  case_printer_bottom_viewed: {
    printer_id: TPrinter;
    first_view: boolean;
    entry_point: TPrinterFlipEntryPoint;
  };
  case_record_viewed: { document_id: TRecordDocument; entry_point: TRecordEntryPoint; first_view: boolean };
  case_notebook_opened: { from_step: TCaseStep; item_count: number };
  case_notebook_item_opened: { item_id: 'receipt' | 'printers' | TRecordDocument };
  case_hint_revealed: { hint_index: number };
  case_replay_started: Record<never, never>;
  case_verdict_opened: { entry_point: TCaseEntryPoint };
  case_clue_found: { clue_id: TEvidence; first_clue: boolean };
  case_answer_submitted: Record<never, never>;
  case_completed: Record<never, never>;
  case_shared: { method: 'native' | 'copy' };
  case_follow_clicked: Record<never, never>;
  case_interest_saved: { persistence: 'device' };
}

const apiKey = (import.meta.env.VITE_AMPLITUDE_API_KEY as string | undefined)?.trim();

const stage = import.meta.env.VITE_AMPLITUDE_STAGE === 'preview' ? 'preview' : 'production';

async function initialize(key: string) {
  const amplitude = await import('@amplitude/analytics-browser');
  await amplitude.init(key, undefined, {
    autocapture: false,
    remoteConfig: { fetchRemoteConfig: false },
    identityStorage: 'none',
    trackingOptions: {
      ipAddress: false,
      language: false,
      platform: false,
    },
  }).promise;
  return amplitude;
}

const analytics = apiKey ? initialize(apiKey).catch(() => null) : null;

export async function trackEvent<T extends keyof ICaseEvents>(event: T, data: ICaseEvents[T]) {
  if (!analytics) return;
  const amplitude = await analytics;
  if (!amplitude) return;
  try {
    await amplitude.track(event, { case_id: CASE_ID, stage, ...data }).promise;
  } catch {
    // Optional analytics cannot interrupt investigation.
  }
}
