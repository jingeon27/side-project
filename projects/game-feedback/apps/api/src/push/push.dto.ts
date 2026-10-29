import type { z } from 'zod';

import { RegisterPushDeviceSchema, UnregisterPushDeviceSchema } from '@game-feedback/contracts';

export { RegisterPushDeviceSchema, UnregisterPushDeviceSchema };

export type TRegisterPushDeviceDto = z.output<typeof RegisterPushDeviceSchema>;
export type TUnregisterPushDeviceDto = z.output<typeof UnregisterPushDeviceSchema>;
