import { ERROR_CODE, fail } from '../common/errors';
import { phase, PHASE, type IContestSchedule } from './contest.policy';

export const CONTEST_FORMAT = { LEGACY: 'LEGACY', POST: 'POST' } as const;
export const GROUP_CONTEST_FILTER = { ACTIVE: 'ACTIVE', OPEN: 'OPEN', COMPLETED: 'COMPLETED' } as const;
export type TGroupContestFilter = (typeof GROUP_CONTEST_FILTER)[keyof typeof GROUP_CONTEST_FILTER];

export function assertContestParticipation(
  contest: IContestSchedule & { groupId: string; format: string },
  groupId: string,
  now = new Date(),
) {
  if (contest.format !== CONTEST_FORMAT.POST || contest.groupId !== groupId)
    fail('이 그룹에서 참여할 수 있는 대회를 선택해 주세요.', ERROR_CODE.BAD_USER_INPUT);
  if (phase(contest, now) !== PHASE.SUBMISSION) fail('게시물을 접수 중인 대회만 참여할 수 있습니다.');
}
