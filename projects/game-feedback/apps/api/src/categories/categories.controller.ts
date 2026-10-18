import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { CategoriesService } from './categories.service';

@Controller('api')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly service: CategoriesService) {}
  @Get('categories') categories() {
    return this.service.categories();
  }
  @HttpCode(200) @Post('admin/categories') category(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.service.category(req, body);
  }
}
