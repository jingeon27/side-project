import { SupportInputSchema } from '@game-feedback/contracts';
import { IsIn } from 'class-validator';
import type { z } from 'zod';

export class StartSupportDto {
  static readonly contract = SupportInputSchema;
  @IsIn(['GENERAL', 'VERIFICATION'])
  declare topic: z.output<typeof SupportInputSchema>['topic'];
}
