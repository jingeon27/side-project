import { startSupportConversation, listSupportThreads, setSupportStatus } from '@game-feedback/sdk';
import { withApiError } from '@/shared/api';
export const startSupport = (topic: 'GENERAL' | 'VERIFICATION') =>
  withApiError(startSupportConversation({ topic }));
export const fetchSupportThreads = () => withApiError(listSupportThreads());
export const updateSupportStatus = ({ id, status }: { id: string; status: 'OPEN' | 'CLOSED' }) =>
  withApiError(setSupportStatus(id, { status }));
