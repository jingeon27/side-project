import { Controller, Get, Inject, Req } from '@nestjs/common';

import { SessionService } from '../../auth/session/session.service';
import type { SessionRequest } from '../../auth/session/session.types';
import { UserVisibilityService } from './user-visibility.service';

/**
 * 웹 서버가 공개 캐시를 사용자별로 거를 때만 부른다. Caddy는 /api만 API로 전달하고 /internal은 edge에서 막으므로
 * 브라우저는 이 경로에 닿지 않는다. 자신을 차단한 사람이 드러나지 않도록 /api 아래에 두지 않는다.
 */
@Controller('internal/visibility')
export class InternalVisibilityController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  @Get('excluded-authors')
  async excludedAuthors(@Req() req: SessionRequest) {
    // 세션 로딩 미들웨어는 /api 경로에만 붙어 있다.
    await this.sessions.loadSession(req);
    return { userIds: await this.visibility.excluded(req) };
  }
}
