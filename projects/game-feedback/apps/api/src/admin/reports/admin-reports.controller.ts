import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../../auth/session.types';
import { ValidatedBody, ValidatedQuery } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminReportsService } from './admin-reports.service';
import { AdminReportListQueryDto, HideContentDto, ReviewReportDto } from './report-input.dto';

@UseGuards(AdminGuard)
@Controller('api/admin')
export class AdminReportsController {
  constructor(@Inject(AdminReportsService) private readonly reports: AdminReportsService) {}
  @Get('reports')
  list(@Req() req: SessionRequest, @ValidatedQuery(AdminReportListQueryDto) query: AdminReportListQueryDto) {
    return this.reports.reports(req, query);
  }
  @Patch('reports/:id')
  review(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ReviewReportDto) body: ReviewReportDto,
  ) {
    return this.reports.review(req, id, body);
  }
  @Post('hide')
  @HttpCode(200)
  hide(@Req() req: SessionRequest, @ValidatedBody(HideContentDto) body: HideContentDto) {
    return this.reports.hide(req, body);
  }
}
