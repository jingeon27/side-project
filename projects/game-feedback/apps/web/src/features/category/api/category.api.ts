import { listCategories } from '@game-feedback/sdk';
export function fetchCategoryList() {
  return listCategories();
}
