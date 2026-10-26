import type { z } from 'zod';

import { AvatarUploadInputSchema } from '@game-feedback/contracts';

export { AvatarUploadInputSchema };

export type TAvatarUploadDto = z.output<typeof AvatarUploadInputSchema>;
