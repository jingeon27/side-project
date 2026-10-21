import { IsIn, IsObject, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import type { z } from 'zod';

import { PostInputSchema, PostPatchSchema, PostViewInputSchema } from '@game-feedback/contracts';

import { Trim } from '../common/http/request-validation';

export class CreatePostDto {
  static readonly contract = PostInputSchema;
  @Trim()
  @IsString()
  @Length(4, 120)
  declare title: z.output<typeof PostInputSchema>['title'];
  @Trim()
  @IsString()
  @Length(1, 10000)
  declare body: z.output<typeof PostInputSchema>['body'];
  @IsString()
  @MinLength(1)
  declare categoryId: z.output<typeof PostInputSchema>['categoryId'];
  @IsOptional()
  @IsIn(['FEEDBACK', 'FRIEND_SALE', 'FRIENDLY', 'COACHING', 'FREE'])
  declare board?: z.output<typeof PostInputSchema>['board'];
  @IsOptional()
  @IsObject()
  declare document?: z.output<typeof PostInputSchema>['document'];
  @IsOptional()
  @IsObject()
  declare coaching?: z.output<typeof PostInputSchema>['coaching'];
  @IsOptional()
  @IsObject()
  declare friendSale?: z.output<typeof PostInputSchema>['friendSale'];
  @IsOptional()
  @IsObject()
  declare battle?: z.output<typeof PostInputSchema>['battle'];
}

export class UpdatePostDto {
  static readonly contract = PostPatchSchema;
  @IsOptional()
  @Trim()
  @IsString()
  @Length(4, 120)
  declare title?: z.output<typeof PostPatchSchema>['title'];
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 10000)
  declare body?: z.output<typeof PostPatchSchema>['body'];
  @IsOptional()
  @IsObject()
  declare document?: z.output<typeof PostPatchSchema>['document'];
  @IsOptional()
  @IsObject()
  declare coaching?: z.output<typeof PostPatchSchema>['coaching'];
  @IsOptional()
  @IsObject()
  declare friendSale?: z.output<typeof PostPatchSchema>['friendSale'];
  @IsOptional()
  @IsObject()
  declare battle?: z.output<typeof PostPatchSchema>['battle'];
}

export class PostViewDto {
  static readonly contract = PostViewInputSchema;
  @IsUUID()
  declare visitorId: z.output<typeof PostViewInputSchema>['visitorId'];
}
