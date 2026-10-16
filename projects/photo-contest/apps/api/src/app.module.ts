import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

import { AuthModule } from './auth/auth.module';
import { DateTimeScalar } from './common/graphql/date-time.scalar';
import { graphqlOptions } from './common/graphql/graphql-options';
import { ContestModule } from './contest/contest.module';
import { DatabaseModule } from './database/database.module';
import { FeedModule } from './feed/feed.module';
import { GroupModule } from './group/group.module';
import { HealthModule } from './health/health.module';
import { LikeModule } from './like/like.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ModerationModule } from './moderation/moderation.module';
import { PostModule } from './post/post.module';
import { StorageModule } from './storage/storage.module';
import { SubmissionModule } from './submission/submission.module';
import { TestingModule } from './testing/testing.module';
import { VoteModule } from './vote/vote.module';

@Module({
  imports: [
    // 앱을 만들 때마다 설정을 계산해 테스트가 바꾼 NODE_ENV(introspection)를 반영한다.
    GraphQLModule.forRootAsync<ApolloDriverConfig>({ driver: ApolloDriver, useFactory: graphqlOptions }),
    DatabaseModule,
    StorageModule,
    AuthModule,
    GroupModule,
    ContestModule,
    SubmissionModule,
    FeedModule,
    PostModule,
    LikeModule,
    VoteModule,
    ModerationModule,
    MaintenanceModule,
    HealthModule,
    TestingModule,
  ],
  providers: [DateTimeScalar],
})
export class AppModule {}
