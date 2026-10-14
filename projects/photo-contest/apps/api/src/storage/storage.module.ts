import { Global, Module } from '@nestjs/common';

import { PhotoStorage } from './photo-storage.service';

@Global()
@Module({ providers: [PhotoStorage], exports: [PhotoStorage] })
export class StorageModule {}
