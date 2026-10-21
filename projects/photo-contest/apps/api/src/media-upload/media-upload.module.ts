import { Module } from '@nestjs/common';
import { GroupModule } from '../group/group.module';
import { MediaProcessor } from '../post/media-processor';
import { MediaUploadService } from './media-upload.service';

@Module({
  imports: [GroupModule],
  providers: [MediaUploadService, MediaProcessor],
  exports: [MediaUploadService],
})
export class MediaUploadModule {}
