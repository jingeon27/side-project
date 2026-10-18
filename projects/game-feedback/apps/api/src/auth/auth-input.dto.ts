import {
  DemoInputSchema,
  TestLoginInputSchema,
  AppExchangeInputSchema,
  OnboardInputSchema,
} from '@game-feedback/contracts';
import { Length, Equals, IsString, Matches } from 'class-validator';
import type { z } from 'zod';
import { Trim } from '../common/http/request-validation';

export class DemoLoginDto {
  static readonly contract = DemoInputSchema;
  @Trim()
  @IsString()
  @Length(2, 24)
  @Matches(/^[\p{L}\p{N}_ .-]+$/u)
  declare nickname: z.output<typeof DemoInputSchema>['nickname'];
}

export class TestLoginDto {
  static readonly contract = TestLoginInputSchema;
  @IsString()
  @Length(1, 100)
  declare accountId: z.output<typeof TestLoginInputSchema>['accountId'];
}

export class AppExchangeDto {
  static readonly contract = AppExchangeInputSchema;
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  declare code: z.output<typeof AppExchangeInputSchema>['code'];
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  declare verifier: z.output<typeof AppExchangeInputSchema>['verifier'];
}

export class OnboardDto {
  static readonly contract = OnboardInputSchema;
  @Trim()
  @IsString()
  @Length(2, 24)
  @Matches(/^[\p{L}\p{N}_ .-]+$/u)
  declare nickname: z.output<typeof OnboardInputSchema>['nickname'];
  @Equals(true)
  declare acceptedTerms: z.output<typeof OnboardInputSchema>['acceptedTerms'];
  @Equals(true)
  declare ageConfirmed: z.output<typeof OnboardInputSchema>['ageConfirmed'];
}
