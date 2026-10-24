import {
  Inject,
  Injectable,
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { finalize, from, mergeMap, type Observable } from 'rxjs';

import { ApiError } from '../common/http/api-error';
import { MediaStorage } from './media-storage.service';

/** 파일 본문을 메모리에 올리는 작업(multipart 수신·검증·저장, 프로필 사진 변환)을 프로세스에서 동시에 처리할 수. */
export const MEDIA_WORK_CONCURRENCY = 3;
/** 슬롯을 기다릴 수 있는 요청 수. 넘으면 본문을 읽기 전에 503으로 거절한다. */
export const MEDIA_WORK_QUEUE = 12;

/** 동시 실행 수와 대기열 길이를 제한하는 세마포어. 대기열이 가득 차면 기다리지 않고 거절한다. */
export class ConcurrencyLimit {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly concurrency: number,
    private readonly queue: number,
  ) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return this.releaser();
    }
    if (this.waiting.length >= this.queue)
      throw new ApiError(503, 'MEDIA_BUSY', '파일 처리 요청이 많습니다. 잠시 후 다시 시도해주세요.');
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    return this.releaser();
  }

  get usage() {
    return { active: this.active, waiting: this.waiting.length };
  }

  private releaser() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // 기다리는 요청이 있으면 슬롯을 그대로 넘긴다.
      const next = this.waiting.shift();
      if (next) {
        next();
        return;
      }
      this.active -= 1;
    };
  }
}

/** 512MB 컨테이너에서 25MB 파일 여러 개가 동시에 메모리에 올라오지 않게 하는 프로세스 단위 상한. */
@Injectable()
export class MediaWorkLimiter extends ConcurrencyLimit {
  constructor() {
    super(MEDIA_WORK_CONCURRENCY, MEDIA_WORK_QUEUE);
  }
}

/** FileInterceptor보다 앞에 두어 multer가 본문을 메모리로 읽기 전에 슬롯을 잡는다. */
@Injectable()
export class MediaWorkInterceptor implements NestInterceptor {
  constructor(@Inject(MediaWorkLimiter) private readonly limiter: MediaWorkLimiter) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.limiter.acquire()).pipe(mergeMap((release) => next.handle().pipe(finalize(release))));
  }
}

/** S3 직접 업로드를 쓰는 배포에서는 multipart 수신을 Guard 단계에서 막는다(인터셉터·multer보다 먼저 실행된다). */
@Injectable()
export class ProxyUploadGuard implements CanActivate {
  constructor(@Inject(MediaStorage) private readonly storage: MediaStorage) {}

  canActivate() {
    this.storage.assertProxyUpload();
    return true;
  }
}
