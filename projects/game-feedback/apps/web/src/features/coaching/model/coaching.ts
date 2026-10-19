import { CoachingRoleSchema } from '@game-feedback/contracts';

export function parseCoachingRole(value: unknown) {
  const result = CoachingRoleSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export const coachingRoles = [
  { value: 'COACH', label: '수강생 모집' },
  { value: 'STUDENT', label: '코치 구함' },
] as const;

export const coachingPricingTypes = [
  {
    value: 'HOURLY',
    label: '시간당',
    feeLabel: '시간당 수강료 (원)',
    budgetLabel: '시간당 희망 수강료 (원)',
    priceLabel: '시간당 {price}',
  },
  {
    value: 'MONTHLY',
    label: '월 단위',
    feeLabel: '월 수강료 (원)',
    budgetLabel: '월 희망 수강료 (원)',
    priceLabel: '월 {price}',
  },
  {
    value: 'GOAL',
    label: '목표 점수 달성까지',
    feeLabel: '목표 달성 총 수강료 (원)',
    budgetLabel: '목표 달성 희망 총 수강료 (원)',
    priceLabel: '목표 달성까지 총 {price}',
  },
] as const;
