import { UseGuards, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { AdminGuard } from '../../common/http/session.guard';
import { ReviewReportDto, HideContentDto } from './report-input.dto';
import { ValidatedBody } from '../../common/http/request-validation';
import type { SessionRequest } from '../../auth/session.types';
import { AdminReportsService } from './admin-reports.service';
@UseGuards(AdminGuard)
@Controller('api/admin')
export class AdminReportsController {
  constructor(@Inject(AdminReportsService) private readonly reports: AdminReportsService) {}
  @Get('reports')
  list(@Req() req: SessionRequest) {
    return this.reports.reports(req);
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
