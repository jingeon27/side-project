import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AdminModule } from './admin/admin.module';
import { AnswersModule } from './answers/answers.module';
import { AuthModule } from './auth/auth.module';
import { BlocksModule } from './blocks/blocks.module';
import { CacheInvalidationModule } from './cache-invalidation/cache-invalidation.module';
import { CategoriesModule } from './categories/categories.module';
import { ChatModule } from './chat/chat.module';
import { CommentsModule } from './comments/comments.module';
import { ApiAccessMiddleware } from './common/http/api-access.middleware';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { resolveAppConfig, type AppOptions } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { FollowsModule } from './follows/follows.module';
import { GameProfilesModule } from './game-profiles/game-profiles.module';
import { HealthModule } from './health/health.module';
import { MediaStorageModule } from './media-storage/media-storage.module';
import { ModerationModule } from './moderation/moderation.module';
import { SentryShutdownService } from './monitoring/sentry-shutdown.service';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { PushModule } from './push/push.module';
import { SupportModule } from './support/support.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    CacheInvalidationModule,
    MediaStorageModule,
    AuthModule,
    PushModule,
    UsersModule,
    PostsModule,
    AnswersModule,
    CommentsModule,
    CategoriesModule,
    AdminModule,
    GameProfilesModule,
    NotificationsModule,
    BlocksModule,
    ModerationModule,
    ChatModule,
    HealthModule,
    SupportModule,
    FollowsModule,
  ],
  providers: [
    ApiAccessMiddleware,
    SentryShutdownService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {
  static register(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.register(resolveAppConfig(options), options.prisma)],
    };
  }
}
