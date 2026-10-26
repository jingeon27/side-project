import type { z } from 'zod';

import { MediaUploadInputSchema } from '@game-feedback/contracts';

export { MediaUploadInputSchema };

export type TMediaUploadDto = z.output<typeof MediaUploadInputSchema>;
