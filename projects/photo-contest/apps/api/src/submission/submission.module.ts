import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { PhotoController } from './photo.controller';
import { SubmissionResolver } from './submission.resolver';
import { SubmissionService } from './submission.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [GroupModule],
  providers: [SubmissionService, SubmissionResolver],
  controllers: [UploadController, PhotoController],
  exports: [SubmissionService],
})
export class SubmissionModule {}
