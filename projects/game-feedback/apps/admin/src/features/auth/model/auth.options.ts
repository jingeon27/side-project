import { queryOptions } from '@tanstack/react-query';
import { fetchSession } from '../api/auth.api';
export function sessionOptions() {
  return queryOptions({ queryKey: ['admin-session'], queryFn: fetchSession, retry: false });
}
