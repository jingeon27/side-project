import { Controller, Get, Inject } from '@nestjs/common';

import { CategoriesService } from './categories.service';

@Controller('api/categories')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}
  @Get()
  list() {
    return this.categories.categories();
  }
}
