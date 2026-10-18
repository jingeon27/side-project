import { Body, Controller, Delete, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { AnswersService } from './answers.service';

@Controller('api')
export class AnswersController {
  constructor(@Inject(AnswersService) private readonly service: AnswersService) {}
  @HttpCode(200) @Post('posts/:id/answers') answer(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.createAnswer(req, id, body);
  }
  @Patch('answers/:id') editAnswer(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateAnswer(req, id, body);
  }
  @Delete('answers/:id') deleteAnswer(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.deleteAnswer(req, id);
  }
  @HttpCode(200) @Post('answers/:id/helpful') helpful(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.helpful(req, id, body);
  }
}
