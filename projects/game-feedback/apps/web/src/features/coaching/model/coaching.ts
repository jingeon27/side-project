import { CoachingRoleSchema, type TCoachingPricingType, type TCoachingRole } from '@game-feedback/contracts';

interface ICoachingRoleOption {
  value: TCoachingRole;
  label: string;
}
interface ICoachingPricingOption {
  value: TCoachingPricingType;
  label: string;
  feeLabel: string;
  budgetLabel: string;
  priceLabel: string;
}

export function parseCoachingRole(value: unknown) {
  const result = CoachingRoleSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export const coachingRoles = [
  { value: 'COACH', label: '수강생 모집' },
  { value: 'STUDENT', label: '코치 구함' },
] as const satisfies readonly ICoachingRoleOption[];

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
    label: '기간 단위',
    feeLabel: '기간 수강료 (원)',
    budgetLabel: '기간 희망 수강료 (원)',
    priceLabel: '기간 총 {price}',
  },
  {
    value: 'GOAL',
    label: '목표 달성까지',
    feeLabel: '목표 달성 총 수강료 (원)',
    budgetLabel: '목표 달성 희망 총 수강료 (원)',
    priceLabel: '목표 달성까지 총 {price}',
  },
] as const satisfies readonly ICoachingPricingOption[];
