import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { GraphQLError } from 'graphql';

import { reportUnexpectedError } from '../../monitoring/sentry';
import { DomainError, httpStatusOf } from '../errors';

const UNMATCHED_ROUTE = '(unmatched)';

/** 경로 원문에는 업로드 토큰이 들어 있으므로 라우트 패턴(/uploads/:token)만 태그로 남긴다. */
function routeOf(request: Request) {
  const route: unknown = request.route;
  const path =
    typeof route === 'object' && route !== null && 'path' in route && typeof route.path === 'string'
      ? route.path
      : UNMATCHED_ROUTE;
  return `${request.method} ${path}`;
}

/**
 * fail()로 던진 오류는 code에 맞는 HTTP 상태와 { message }로, 나머지는 Nest 기본 응답으로 바꾼다.
 * 5xx는 예상하지 못한 오류이므로 라우트 태그와 함께 Sentry로 보낸다. 4xx 업무 오류는 보내지 않는다.
 */
@Catch()
export class ApiExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    // GraphQL은 Apollo가 code별로 응답하고 내부 오류 보고도 Apollo 플러그인이 한다.
    // 업무 오류만 그대로 돌려주고, 나머지는 Nest 기본 처리(로그 후 다시 던짐)에 맡긴다.
    if (host.getType<string>() === 'graphql')
      return exception instanceof GraphQLError ? exception : undefined;
    const http = host.switchToHttp();
    const status = this.statusOf(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR)
      reportUnexpectedError(exception, { route: routeOf(http.getRequest<Request>()) });
    if (!(exception instanceof GraphQLError)) return super.catch(exception, host);
    http.getResponse<Response>().status(status).json({ message: exception.message });
    return undefined;
  }

  /** Nest 기본 필터가 응답할 상태와 같은 기준 */
  private statusOf(exception: unknown): number {
    if (exception instanceof DomainError) return httpStatusOf(exception.code);
    if (exception instanceof GraphQLError) return httpStatusOf(exception.extensions.code);
    if (exception instanceof HttpException) return exception.getStatus();
    if (this.isHttpError(exception)) return exception.statusCode;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
