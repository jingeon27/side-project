import { Args, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { FeedService, type IFeedRange } from './feed.service';

@Resolver('PhotoFeedItem')
export class FeedResolver {
  constructor(private readonly feed: FeedService) {}

  @Query()
  myPhotoFeed(@Viewer() viewer: IViewer, @Args() range: IFeedRange) {
    return this.feed.list(viewer, range);
  }
}
