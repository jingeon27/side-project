import { IsIn, IsUUID, Matches } from 'class-validator';

import { RegisterPushDeviceSchema, UnregisterPushDeviceSchema } from '@game-feedback/contracts';
import { EXPO_PUSH_TOKEN_PATTERN } from '@side/push-notifications';

export class RegisterPushDeviceDto {
  static readonly contract = RegisterPushDeviceSchema;
  @IsUUID('4') installationId!: string;
  @Matches(EXPO_PUSH_TOKEN_PATTERN) token!: string;
  @IsIn(['ios', 'android']) platform!: 'ios' | 'android';
  @IsIn(['ko', 'en', 'ja']) locale!: 'ko' | 'en' | 'ja';
}
export class UnregisterPushDeviceDto {
  static readonly contract = UnregisterPushDeviceSchema;
  @IsUUID('4') installationId!: string;
}
