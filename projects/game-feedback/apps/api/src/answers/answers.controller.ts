import { Controller, Delete, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { AnswerBodyDto, HelpfulDto } from './answer-input.dto';
import { AnswersService } from './answers.service';

@Controller('api')
export class AnswersController {
  constructor(@Inject(AnswersService) private readonly service: AnswersService) {}
  @HttpCode(200)
  @Post('posts/:id/answers')
  @UseGuards(UserGuard)
  answer(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(AnswerBodyDto) body: AnswerBodyDto,
  ) {
    return this.service.createAnswer(req, id, body);
  }
  @Patch('answers/:id')
  @UseGuards(UserGuard)
  editAnswer(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(AnswerBodyDto) body: AnswerBodyDto,
  ) {
    return this.service.updateAnswer(req, id, body);
  }
  @Delete('answers/:id')
  @UseGuards(UserGuard)
  deleteAnswer(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.deleteAnswer(req, id);
  }
  @HttpCode(200)
  @Post('answers/:id/helpful')
  @UseGuards(UserGuard)
  helpful(@Req() req: SessionRequest, @Param('id') id: string, @ValidatedBody(HelpfulDto) body: HelpfulDto) {
    return this.service.helpful(req, id, body);
  }
}
