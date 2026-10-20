import { Args,Mutation,Parent,ResolveField,Resolver } from '@nestjs/graphql';
import type { IViewer } from '../auth/session.service';
import { OptionalViewer,Viewer } from '../auth/viewer.decorator';
import { GroupCategoryService } from './group-category.service';
import type { IGroupNode } from './group.service';

@Resolver('Group')
export class GroupCategoryResolver {
  constructor(private readonly categoryService: GroupCategoryService) {}
  @ResolveField()
  categories(@OptionalViewer() viewer: IViewer | null, @Parent() group: IGroupNode) {
    if (!group.canViewPosts) return [];
    return this.categoryService.list(viewer, group.id);
  }
  @Mutation()
  createGroupCategory(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('name') name: string,
  ) {
    return this.categoryService.create(viewer, groupId, name);
  }
  @Mutation()
  renameGroupCategory(
    @Viewer() viewer: IViewer,
    @Args('categoryId') categoryId: string,
    @Args('name') name: string,
  ) {
    return this.categoryService.rename(viewer, categoryId, name);
  }
  @Mutation()
  reorderGroupCategories(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('categoryIds') categoryIds: string[],
  ) {
    return this.categoryService.reorder(viewer, groupId, categoryIds);
  }
  @Mutation()
  archiveGroupCategory(@Viewer() viewer: IViewer, @Args('categoryId') categoryId: string) {
    return this.categoryService.archive(viewer, categoryId);
  }
}
