import { z } from 'zod';

import { EXPO_PUSH_TOKEN_PATTERN } from '@side/toolkit/push-notifications';

export const RegisterPushDeviceSchema = z.strictObject({
  installationId: z.uuidv4(),
  token: z.string().regex(EXPO_PUSH_TOKEN_PATTERN),
  platform: z.enum(['ios', 'android']),
  locale: z.enum(['ko', 'en', 'ja']),
});
export type TRegisterPushDeviceDto = z.output<typeof RegisterPushDeviceSchema>;

export const UnregisterPushDeviceSchema = RegisterPushDeviceSchema.pick({ installationId: true });
export type TUnregisterPushDeviceDto = z.output<typeof UnregisterPushDeviceSchema>;
