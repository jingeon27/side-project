import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { AdminCategoriesController } from './categories/admin-categories.controller';
import { AdminCategoriesService } from './categories/admin-categories.service';
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsService } from './reports/admin-reports.service';
import { AdminSupportController } from './support/admin-support.controller';
import { AdminSupportService } from './support/admin-support.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
@Module({
  imports: [ChatModule],
  controllers: [
    AdminCategoriesController,
    AdminUsersController,
    AdminReportsController,
    AdminSupportController,
  ],
  providers: [AdminCategoriesService, AdminUsersService, AdminReportsService, AdminSupportService],
})
export class AdminModule {}
