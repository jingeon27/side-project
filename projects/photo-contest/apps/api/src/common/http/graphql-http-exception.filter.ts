import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';

import { httpStatusOf } from '../errors';

/** 컨트롤러에서 fail()로 던진 오류를 code에 맞는 HTTP 상태와 { message }로 바꾼다. GraphQL 요청은 Apollo에 맡긴다. */
@Catch(GraphQLError)
export class GraphqlHttpExceptionFilter implements ExceptionFilter {
  catch(error: GraphQLError, host: ArgumentsHost) {
    if (host.getType<string>() === 'graphql') return error;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(httpStatusOf(error.extensions.code))
      .json({ message: error.message });
  }
}
