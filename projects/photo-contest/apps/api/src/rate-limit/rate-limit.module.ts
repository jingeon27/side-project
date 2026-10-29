import { Global, Module } from '@nestjs/common';

import { RateLimitService } from './rate-limit.service';

// 여러 기능 모듈의 쓰기 서비스가 같은 제한을 쓰도록 전역으로 둔다.
@Global()
@Module({ providers: [RateLimitService], exports: [RateLimitService] })
export class RateLimitModule {}
