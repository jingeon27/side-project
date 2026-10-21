import type { z } from 'zod';

import type { DemoInputSchema, OnboardInputSchema, TestLoginInputSchema } from '@game-feedback/contracts';

export type TDemoLoginInput = z.input<typeof DemoInputSchema>;
export type TOnboardInput = z.input<typeof OnboardInputSchema>;
export type TTestLoginInput = z.input<typeof TestLoginInputSchema>;
