import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminCategoriesController } from './categories/admin-categories.controller';
import { AdminCategoriesService } from './categories/admin-categories.service';
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsService } from './reports/admin-reports.service';
import { AdminSupportController } from './support/admin-support.controller';
import { AdminSupportService } from './support/admin-support.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';

@Module({
  imports: [AuthModule, ChatModule],
  controllers: [
    AdminAuthController,
    AdminCategoriesController,
    AdminUsersController,
    AdminReportsController,
    AdminSupportController,
  ],
  providers: [
    AdminAuthService,
    AdminCategoriesService,
    AdminUsersService,
    AdminReportsService,
    AdminSupportService,
  ],
})
export class AdminModule {}
