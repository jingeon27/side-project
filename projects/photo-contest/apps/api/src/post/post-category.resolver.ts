import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { PostCategoryService } from './post-category.service';

@Resolver()
export class PostCategoryResolver {
  constructor(private readonly categories: PostCategoryService) {}
  @Mutation()
  setPostCategory(
    @Viewer() viewer: IViewer,
    @Args('postId') postId: string,
    @Args('categoryId') categoryId?: string | null,
  ) {
    return this.categories.set(viewer, postId, categoryId ?? null);
  }
}
