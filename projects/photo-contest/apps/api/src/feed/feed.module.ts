import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { FeedResolver } from './feed.resolver';
import { FeedService } from './feed.service';

@Module({ imports: [GroupModule], providers: [FeedService, FeedResolver] })
export class FeedModule {}
