import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { PhotoController } from './photo.controller';
import { SubmissionResolver } from './submission.resolver';
import { SubmissionService } from './submission.service';
import { MediaUploadModule } from '../media-upload/media-upload.module';

@Module({
  imports: [GroupModule, MediaUploadModule],
  providers: [SubmissionService, SubmissionResolver],
  controllers: [PhotoController],
  exports: [SubmissionService],
})
export class SubmissionModule {}
