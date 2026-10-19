import { SupportRepository } from './support.repository';
import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
@Module({
  imports: [ChatModule],
  controllers: [SupportController],
  providers: [SupportRepository, SupportService],
})
export class SupportModule {}
