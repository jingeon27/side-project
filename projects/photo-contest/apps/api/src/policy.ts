import { GraphQLError } from 'graphql';
import { z } from 'zod';
export function fail(message: string, code = 'BAD_USER_INPUT'): never {
  throw new GraphQLError(message, { extensions: { code } });
}
export function phase(contest: { startsAt: Date; submissionEndsAt: Date; endsAt: Date }, now = new Date()) {
  if (now < contest.startsAt) return 'UPCOMING';
  if (now < contest.submissionEndsAt) return 'SUBMISSION';
  if (now < contest.endsAt) return 'VOTING';
  return 'COMPLETED';
}
export function textValue(value: unknown, max: number, label: string) {
  const parsed = z.string().trim().min(1).max(max).safeParse(value);
  if (!parsed.success) fail(`${label}은(는) 1~${max}자여야 합니다.`);
  return parsed.data;
}
export function contestDates(
  startsAt: unknown,
  submissionEndsAt: unknown,
  endsAt: unknown,
  now = new Date(),
) {
  const parsed = z
    .object({ startsAt: z.coerce.date(), submissionEndsAt: z.coerce.date(), endsAt: z.coerce.date() })
    .safeParse({ startsAt, submissionEndsAt, endsAt });
  if (!parsed.success) fail('올바른 대회 시각을 입력해 주세요.');
  const dates = parsed.data;
  if (
    dates.startsAt.getTime() < now.getTime() - 60_000 ||
    dates.startsAt >= dates.submissionEndsAt ||
    dates.submissionEndsAt >= dates.endsAt ||
    dates.endsAt.getTime() - dates.startsAt.getTime() > 90 * 86400_000
  )
    fail('시작, 제출 마감, 투표 마감 순서로 90일 이내의 기간을 설정해 주세요.');
  return dates;
}
