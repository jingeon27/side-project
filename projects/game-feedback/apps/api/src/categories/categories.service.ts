import { CategoriesRepository } from './categories.repository';
import { Inject, Injectable } from '@nestjs/common';
@Injectable()
export class CategoriesService {
  constructor(@Inject(CategoriesRepository) private readonly repository: CategoriesRepository) {}
  categories() {
    return this.repository.activeCategories();
  }
}
