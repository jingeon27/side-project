import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { resolveAppConfig, type AppOptions } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { AnswersModule } from './answers/answers.module';
import { CommentsModule } from './comments/comments.module';
import { AdminModule } from './admin/admin.module';
import { CategoriesModule } from './categories/categories.module';
import { GameProfilesModule } from './game-profiles/game-profiles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BlocksModule } from './blocks/blocks.module';
import { ModerationModule } from './moderation/moderation.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { SupportModule } from './support/support.module';
import { FollowsModule } from './follows/follows.module';
import { ApiAccessMiddleware } from './common/http/api-access.middleware';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { MediaStorageModule } from './media-storage/media-storage.module';
import { CacheInvalidationModule } from './cache-invalidation/cache-invalidation.module';

@Module({
  imports: [
    CacheInvalidationModule,
    MediaStorageModule,
    AuthModule,
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
  providers: [ApiAccessMiddleware, { provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {
  static register(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.register(resolveAppConfig(options), options.prisma)],
    };
  }
}
