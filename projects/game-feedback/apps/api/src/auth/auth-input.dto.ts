import type { z } from 'zod';

import {
  AppExchangeInputSchema,
  DemoInputSchema,
  OnboardInputSchema,
  TestLoginInputSchema,
} from '@game-feedback/contracts';

export { DemoInputSchema, TestLoginInputSchema, AppExchangeInputSchema, OnboardInputSchema };

export type TDemoLoginDto = z.output<typeof DemoInputSchema>;
export type TTestLoginDto = z.output<typeof TestLoginInputSchema>;
export type TAppExchangeDto = z.output<typeof AppExchangeInputSchema>;
export type TOnboardDto = z.output<typeof OnboardInputSchema>;
