import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import type { z } from 'zod';

import {
  ChatMessageInputSchema,
  ChatReadInputSchema,
  ClearChatHistoryInputSchema,
  ConversationInputSchema,
} from '@game-feedback/contracts';

import { Trim } from '../common/http/request-validation';

export class CreateConversationDto {
  static readonly contract = ConversationInputSchema;
  @IsString()
  @Length(1, 100)
  declare recipientId: z.output<typeof ConversationInputSchema>['recipientId'];
}

export class SendMessageDto {
  static readonly contract = ChatMessageInputSchema;
  @Trim()
  @IsString()
  @MaxLength(2000)
  declare body: z.output<typeof ChatMessageInputSchema>['body'];
  @IsUUID()
  declare clientMessageId: z.output<typeof ChatMessageInputSchema>['clientMessageId'];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  declare attachmentIds?: z.output<typeof ChatMessageInputSchema>['attachmentIds'];
}

export class ClearHistoryDto {
  static readonly contract = ClearChatHistoryInputSchema;
  @IsString()
  @Length(1, 100)
  declare throughMessageId: z.output<typeof ClearChatHistoryInputSchema>['throughMessageId'];
}

export class ReadMessageDto {
  static readonly contract = ChatReadInputSchema;
  @IsString()
  @Length(1, 100)
  declare messageId: z.output<typeof ChatReadInputSchema>['messageId'];
}
