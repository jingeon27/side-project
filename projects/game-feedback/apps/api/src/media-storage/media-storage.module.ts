import { MediaStorageRepository } from './media-storage.repository';
import { Global, Module } from '@nestjs/common';
import { MediaStorage } from './media-storage.service';

@Global()
@Module({ providers: [MediaStorageRepository, MediaStorage], exports: [MediaStorage] })
export class MediaStorageModule {}
