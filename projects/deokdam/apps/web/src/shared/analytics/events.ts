import type { TProvider } from '@/features/account/navigation';
import type { TTopic } from '@/shared/topics';

export const event = {
  SignInClicked: 'signin_clicked',
  SignInCompleted: 'signin_completed',
  SignOutClicked: 'signout_clicked',
  RecordSaveClicked: 'record_save_clicked',
  JournalImportClicked: 'journal_import_clicked',
  MessageCreateClicked: 'message_create_clicked',
  HistoryOpenClicked: 'history_open_clicked',
  ArchivedReadingOpened: 'archived_reading_opened',
  HistorySaved: 'history_saved',
  JournalImported: 'journal_imported',
  StartClicked: 'landing_start_clicked',
  StoriesLinkClicked: 'stories_link_clicked',
  StoriesOpened: 'stories_opened',
  EpisodeOpened: 'episode_opened',
  ShortsPlayerOpened: 'shorts_player_opened',
  MessageCopied: 'deok_message_copied',
  PostcardActionClicked: 'postcard_action_clicked',
  PostcardExported: 'postcard_exported',
  ReadingRequested: 'reading_requested',
  ReadingShown: 'reading_shown',
  ReadingBasisOpened: 'reading_basis_opened',
  DeokSaved: 'deok_saved',
  JournalOpened: 'journal_opened',
  JournalShared: 'journal_shared',
  RewardClicked: 'rewarded_ad_clicked',
  RewardGranted: 'rewarded_ad_granted',
  CheckoutClicked: 'checkout_clicked',
  ReportOffered: 'report_offer_viewed',
  PurchaseVerified: 'purchase_verified',
  ReportIssued: 'report_issued',
  RefundRequested: 'refund_requested',
} as const satisfies Record<string, keyof IEventProperties>;

interface IProductProperties {
  product: 'job-week' | 'parent-week';
}

interface IPostcardProperties {
  surface: 'episode' | 'journal';
  method: 'share' | 'download' | 'copy' | 'link';
  episode?: string;
  topic?: TTopic;
}

export interface IEventProperties {
  signin_clicked: { provider: TProvider; surface: 'journal' | 'shop' };
  signin_completed: { provider: TProvider };
  signout_clicked: { provider: TProvider };
  record_save_clicked: { surface: 'episode' | 'reading'; topic: TTopic };
  journal_import_clicked: Record<string, never>;
  message_create_clicked: { episode: string; topic: TTopic };
  history_open_clicked: { surface: 'reading' | 'episode' };
  archived_reading_opened: { topic: TTopic; mode: 'basic' | 'ai' };
  history_saved: { kind: 'message' | 'reading'; location: 'account' | 'device' };
  journal_imported: { count: number };
  landing_start_clicked: { surface: 'hero' | 'topics' | 'episode'; topic?: TTopic };
  stories_link_clicked: { surface: 'home' | 'header' };
  stories_opened: Record<string, never>;
  episode_opened: { episode: string; topic: TTopic; source: 'youtube' | 'direct' };
  shorts_player_opened: { surface: 'story-list' } | { surface: 'episode'; episode: string };
  deok_message_copied: { episode: string; topic: TTopic };
  postcard_action_clicked: IPostcardProperties;
  postcard_exported: IPostcardProperties;
  reading_requested: { topic: TTopic; withExperience: boolean };
  reading_shown: {
    topic: TTopic;
    mode: 'basic' | 'ai';
    cached: boolean;
    adult: boolean;
    grounded: boolean;
    withExperience: boolean;
  };
  reading_basis_opened: { topic: TTopic; mode: 'basic' | 'ai' };
  deok_saved: {
    topic: TTopic;
    surface: 'episode' | 'reading';
    episode?: string;
    alternative: boolean;
    location?: 'account' | 'device';
  };
  journal_opened: Record<string, never>;
  journal_shared: { method: 'copy' | 'share' };
  rewarded_ad_clicked: { topic: TTopic };
  rewarded_ad_granted: { topic: TTopic };
  checkout_clicked: IProductProperties;
  report_offer_viewed: IProductProperties;
  purchase_verified: IProductProperties;
  report_issued: IProductProperties;
  refund_requested: IProductProperties;
}
