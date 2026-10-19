import { CategoryInputSchema } from '@game-feedback/contracts';
import { Length, IsString, Matches, MaxLength } from 'class-validator';
import type { z } from 'zod';
import { Trim } from '../../common/http/request-validation';

export class CreateCategoryDto {
  static readonly contract = CategoryInputSchema;
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(40)
  declare slug: z.output<typeof CategoryInputSchema>['slug'];
  @Trim()
  @IsString()
  @Length(1, 50)
  declare name: z.output<typeof CategoryInputSchema>['name'];
}
