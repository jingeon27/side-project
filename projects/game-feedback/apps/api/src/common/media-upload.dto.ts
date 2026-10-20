import { MediaUploadInputSchema } from '@game-feedback/contracts';
import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import type { z } from 'zod';
import { Trim } from './http/request-validation';

export class MediaUploadDto {
  static readonly contract = MediaUploadInputSchema;
  @Trim()
  @IsString()
  @Length(1, 1000)
  declare name: z.output<typeof MediaUploadInputSchema>['name'];
  @IsIn(MediaUploadInputSchema.shape.mimeType.options)
  declare mimeType: z.output<typeof MediaUploadInputSchema>['mimeType'];
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  declare size: number;
}
