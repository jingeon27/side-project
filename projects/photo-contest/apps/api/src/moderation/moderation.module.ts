import { ModerationRepository } from './moderation.repository';
import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { ModerationResolver } from './moderation.resolver';
import { ModerationService } from './moderation.service';

@Module({
  imports: [GroupModule],
  providers: [ModerationRepository, ModerationService, ModerationResolver],
})
export class ModerationModule {}
