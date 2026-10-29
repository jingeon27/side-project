import { startSupportConversation } from '@game-feedback/sdk';

import { withApiError } from '@/shared/api';

export const startSupport = (topic: 'GENERAL' | 'VERIFICATION') =>
  withApiError(startSupportConversation({ topic }));
