import type { ReportInput } from '@game-feedback/contracts';
import { blockUser, createReport } from '@game-feedback/sdk';

export function postBlockUser(body: { blockedUserId: string }) {
  return blockUser(body);
}
export function postReport(body: ReportInput) {
  return createReport(body);
}
