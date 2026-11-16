import { Module } from '@nestjs/common';

import { MembershipModule } from '../group/membership/membership.module';
import { MediaUploadService } from './media-upload.service';

@Module({
  imports: [MembershipModule],
  providers: [MediaUploadService],
  exports: [MediaUploadService],
})
export class MediaUploadModule {}
