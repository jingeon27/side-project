import { Module } from '@nestjs/common';

import { MembershipModule } from '../group/membership.module';
import { MediaProcessor } from '../post/media-processor';
import { MediaUploadService } from './media-upload.service';

@Module({
  imports: [MembershipModule],
  providers: [MediaUploadService, MediaProcessor],
  exports: [MediaUploadService],
})
export class MediaUploadModule {}
