import { UseGuards, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { AdminGuard } from '../../common/http/session.guard';
import { CreateCategoryDto } from './category-input.dto';
import { ValidatedBody } from '../../common/http/request-validation';
import type { SessionRequest } from '../../auth/session.types';
import { AdminCategoriesService } from './admin-categories.service';
@UseGuards(AdminGuard)
@Controller('api/admin/categories')
export class AdminCategoriesController {
  constructor(@Inject(AdminCategoriesService) private readonly categories: AdminCategoriesService) {}
  @Post()
  @HttpCode(200)
  create(@Req() req: SessionRequest, @ValidatedBody(CreateCategoryDto) body: CreateCategoryDto) {
    return this.categories.create(req, body);
  }
}
