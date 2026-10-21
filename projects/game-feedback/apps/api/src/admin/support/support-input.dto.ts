import { IsIn } from 'class-validator';
import type { z } from 'zod';

import { SupportStatusInputSchema } from '@game-feedback/contracts';

export class SupportStatusDto {
  static readonly contract = SupportStatusInputSchema;
  @IsIn(['OPEN', 'CLOSED'])
  declare status: z.output<typeof SupportStatusInputSchema>['status'];
}
