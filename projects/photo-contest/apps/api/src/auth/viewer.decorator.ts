import { createParamDecorator, Injectable, type ExecutionContext, type PipeTransform } from '@nestjs/common';
import type { Request } from 'express';

import { requestOf } from '../common/graphql/graphql-context';
import { SessionService, type IViewer } from './session.service';

@Injectable()
export class RequiredViewerPipe implements PipeTransform<Request, Promise<IViewer>> {
  constructor(private readonly sessions: SessionService) {}

  transform(req: Request) {
    return this.sessions.requireViewer(req);
  }
}

@Injectable()
export class OptionalViewerPipe implements PipeTransform<Request, Promise<IViewer | null>> {
  constructor(private readonly sessions: SessionService) {}

  transform(req: Request) {
    return this.sessions.viewer(req);
  }
}

// 데코레이터에는 DI가 없으므로 요청만 꺼내고, 세션 조회는 SessionService를 주입받는 파이프가 한다.
const CurrentRequest = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  requestOf(context),
);

/** 로그인한 사용자. 로그인하지 않았으면 UNAUTHENTICATED(HTTP 401). REST·GraphQL 공용 */
export function Viewer(): ParameterDecorator {
  return CurrentRequest(RequiredViewerPipe);
}

/** 로그인한 사용자 또는 null. REST·GraphQL 공용 */
export function OptionalViewer(): ParameterDecorator {
  return CurrentRequest(OptionalViewerPipe);
}
