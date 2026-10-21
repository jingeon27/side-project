import { IsIn } from 'class-validator';
import type { z } from 'zod';

import { SupportInputSchema } from '@game-feedback/contracts';

export class StartSupportDto {
  static readonly contract = SupportInputSchema;
  @IsIn(['GENERAL', 'VERIFICATION'])
  declare topic: z.output<typeof SupportInputSchema>['topic'];
}
