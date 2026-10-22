import { Global, Module } from '@nestjs/common';

import { MediaStorage } from './media-storage.service';
import { MediaWorkLimiter } from './media-work';

@Global()
@Module({ providers: [MediaStorage, MediaWorkLimiter], exports: [MediaStorage, MediaWorkLimiter] })
export class MediaStorageModule {}
