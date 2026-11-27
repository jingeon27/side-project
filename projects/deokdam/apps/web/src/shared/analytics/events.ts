import type { TTopic } from '@/shared/topics';

export const event = {
  StartClicked: 'landing_start_clicked',
  EpisodeOpened: 'episode_opened',
  ShortsPlayerOpened: 'shorts_player_opened',
  MessageCopied: 'deok_message_copied',
  ReadingRequested: 'reading_requested',
  ReadingShown: 'reading_shown',
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

export interface IEventProperties {
  landing_start_clicked: { surface: 'hero' | 'topics' | 'episode'; topic?: TTopic };
  episode_opened: { episode: string; topic: TTopic; source: 'youtube' | 'direct' };
  shorts_player_opened: { surface: 'story-list' } | { surface: 'episode'; episode: string };
  deok_message_copied: { episode: string; topic: TTopic };
  reading_requested: { topic: TTopic; withExperience: boolean };
  reading_shown: {
    topic: TTopic;
    mode: 'basic' | 'ai';
    cached: boolean;
    adult: boolean;
    grounded: boolean;
    withExperience: boolean;
  };
  deok_saved: { topic: TTopic; surface: 'episode' | 'reading'; episode?: string; alternative: boolean };
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
