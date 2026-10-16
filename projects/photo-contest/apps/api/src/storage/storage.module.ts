import { Global, Module } from '@nestjs/common';

import { MediaStorage } from './media-storage.service';
import { PhotoStorage } from './photo-storage.service';

@Global()
@Module({ providers: [PhotoStorage, MediaStorage], exports: [PhotoStorage, MediaStorage] })
export class StorageModule {}
