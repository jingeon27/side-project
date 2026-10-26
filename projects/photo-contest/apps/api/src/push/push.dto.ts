import { IsIn, IsUUID, Matches } from 'class-validator';

import { EXPO_PUSH_TOKEN_PATTERN } from '@side/toolkit/push-notifications';

export class RegisterPushDeviceDto {
  @IsUUID('4') installationId!: string;
  @Matches(EXPO_PUSH_TOKEN_PATTERN) token!: string;
  @IsIn(['ios', 'android']) platform!: 'ios' | 'android';
  @IsIn(['ko', 'en', 'ja']) locale!: 'ko' | 'en' | 'ja';
}
export class UnregisterPushDeviceDto {
  @IsUUID('4') installationId!: string;
}
