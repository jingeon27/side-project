import type { z } from 'zod';

import {
  AdminReportListQuerySchema,
  HideInputSchema,
  ReportReviewInputSchema,
} from '@game-feedback/contracts';

export { ReportReviewInputSchema, HideInputSchema, AdminReportListQuerySchema };

export type TReviewReportDto = z.output<typeof ReportReviewInputSchema>;
export type THideContentDto = z.output<typeof HideInputSchema>;
export type TAdminReportListQueryDto = z.output<typeof AdminReportListQuerySchema>;
