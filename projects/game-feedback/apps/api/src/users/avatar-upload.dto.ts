import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import type { z } from 'zod';

import { AvatarUploadInputSchema } from '@game-feedback/contracts';

import { Trim } from '../common/http/request-validation';

export class AvatarUploadDto {
  static readonly contract = AvatarUploadInputSchema;
  @Trim()
  @IsString()
  @Length(1, 1000)
  declare name: z.output<typeof AvatarUploadInputSchema>['name'];
  @IsIn(AvatarUploadInputSchema.shape.mimeType.options)
  declare mimeType: z.output<typeof AvatarUploadInputSchema>['mimeType'];
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  declare size: number;
}
