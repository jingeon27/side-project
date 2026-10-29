import { Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../../auth/session/session.types';
import { ValidatedBody } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminCategoriesService } from './admin-categories.service';
import { CategoryInputSchema, type TCreateCategoryDto } from './category-input.dto';

@UseGuards(AdminGuard)
@Controller('api/admin/categories')
export class AdminCategoriesController {
  constructor(@Inject(AdminCategoriesService) private readonly categories: AdminCategoriesService) {}
  @Post()
  @HttpCode(200)
  create(@Req() req: SessionRequest, @ValidatedBody(CategoryInputSchema) body: TCreateCategoryDto) {
    return this.categories.create(req, body);
  }
}
