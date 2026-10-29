import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { SessionRequest } from '../auth/session/session.types';
import { ListQuerySchema, type TListQueryDto } from '../common/http/list-query.dto';
import { ValidatedBody, ValidatedQuery } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import {
  AnswerInputSchema,
  HelpfulInputSchema,
  type TAnswerBodyDto,
  type THelpfulDto,
} from './answer-input.dto';
import { AnswersService } from './answers.service';

@Controller('api')
export class AnswersController {
  constructor(@Inject(AnswersService) private readonly service: AnswersService) {}
  @Get('posts/:id/answers')
  answers(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedQuery(ListQuerySchema) query: TListQueryDto,
  ) {
    return this.service.page(req, id, query);
  }
  @HttpCode(200)
  @Post('posts/:id/answers')
  @UseGuards(UserGuard)
  answer(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(AnswerInputSchema) body: TAnswerBodyDto,
  ) {
    return this.service.createAnswer(req, id, body);
  }
  @Patch('answers/:id')
  @UseGuards(UserGuard)
  editAnswer(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(AnswerInputSchema) body: TAnswerBodyDto,
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
  helpful(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(HelpfulInputSchema) body: THelpfulDto,
  ) {
    return this.service.helpful(req, id, body);
  }
}
