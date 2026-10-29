import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../../auth/session/session.types';
import { ValidatedBody, ValidatedQuery } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminReportsService } from './admin-reports.service';
import {
  AdminReportListQuerySchema,
  HideInputSchema,
  ReportReviewInputSchema,
  type TAdminReportListQueryDto,
  type THideContentDto,
  type TReviewReportDto,
} from './report-input.dto';

@UseGuards(AdminGuard)
@Controller('api/admin')
export class AdminReportsController {
  constructor(@Inject(AdminReportsService) private readonly reports: AdminReportsService) {}
  @Get('reports')
  list(
    @Req() req: SessionRequest,
    @ValidatedQuery(AdminReportListQuerySchema) query: TAdminReportListQueryDto,
  ) {
    return this.reports.reports(req, query);
  }
  @Patch('reports/:id')
  review(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ReportReviewInputSchema) body: TReviewReportDto,
  ) {
    return this.reports.review(req, id, body);
  }
  @Post('hide')
  @HttpCode(200)
  hide(@Req() req: SessionRequest, @ValidatedBody(HideInputSchema) body: THideContentDto) {
    return this.reports.hide(req, body);
  }
}
