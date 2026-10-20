import type { TSocialProvider } from '@game-feedback/contracts';

export const ANALYTICS_EVENT = {
  LoginOpened: 'login_opened',
  LoginProviderSelected: 'login_provider_selected',
  LoginSucceeded: 'login_succeeded',
  SignupCompleted: 'signup_completed',
  PostCreated: 'post_created',
  ChatStarted: 'chat_started',
  MessageSent: 'message_sent',
} as const;
export type TAnalyticsEventName = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];
export type TAnalyticsProperties = {
  login_opened: Record<string, never>;
  login_provider_selected: { provider: TSocialProvider };
  login_succeeded: { provider: TSocialProvider };
  signup_completed: { provider: TSocialProvider };
  post_created: { board: string; game: string };
  chat_started: { source: 'post' | 'comment' | 'profile' };
  message_sent: { has_attachment: boolean };
};
