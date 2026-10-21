import { Injectable, type CanActivate } from '@nestjs/common';

import { ERROR_CODE, fail } from '../common/errors';
import { testingApiEnabled } from '../config/env';

@Injectable()
export class TestingGuard implements CanActivate {
  canActivate() {
    if (!testingApiEnabled()) fail('찾을 수 없는 주소입니다.', ERROR_CODE.NOT_FOUND);
    return true;
  }
}
