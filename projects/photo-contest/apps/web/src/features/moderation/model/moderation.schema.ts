import { z } from 'zod';

export const reportSchema = z.object({
  reason: z.string().trim().min(1, '신고 이유를 입력해 주세요.').max(500, '500자 이내로 입력해 주세요.'),
});

export type TReportInput = z.input<typeof reportSchema>;
