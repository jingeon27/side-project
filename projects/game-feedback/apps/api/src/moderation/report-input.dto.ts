import type { z } from 'zod';

import { ReportInputSchema } from '@game-feedback/contracts';

export { ReportInputSchema };

export type TCreateReportDto = z.output<typeof ReportInputSchema>;
