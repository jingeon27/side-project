import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { flush } from '@sentry/node';

@Injectable()
export class SentryShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown() {
    // HTTP 응답과 다른 종료 훅이 마지막 지표를 기록한 뒤, SIGTERM 재전달 전에 전송한다.
    await flush(2000);
  }
}
