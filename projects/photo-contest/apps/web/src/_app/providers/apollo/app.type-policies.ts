import { contestTypePolicies } from '@/features/contest';
import { groupTypePolicies } from '@/features/group';
import { inviteTypePolicies } from '@/features/invite';
import { rankingTypePolicies } from '@/features/ranking';
import { submissionTypePolicies } from '@/features/submission';
import { mergeTypePolicies } from '@/shared/api/type-policies.helper';

/** 도메인별 typePolicies를 합친 앱 전체 캐시 정책. 새 도메인 정책은 여기에 더한다. */
export const APP_TYPE_POLICIES = mergeTypePolicies(
  groupTypePolicies,
  contestTypePolicies,
  submissionTypePolicies,
  inviteTypePolicies,
  rankingTypePolicies,
);
