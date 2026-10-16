export type TChatConnection = 'connecting' | 'live' | 'retrying' | 'offline';

export interface IChatMessageInput {
  body: string;
  clientMessageId: string;
}
