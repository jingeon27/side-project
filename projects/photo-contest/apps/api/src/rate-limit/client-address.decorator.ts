import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { requestOf } from '../common/graphql/graphql-context';
import { rateLimitAddress } from '../common/http/client-address';

/** 요청 제한에 쓸 클라이언트 주소(내부 웹 서버 요청이면 null). REST·GraphQL 공용 */
export const ClientAddress = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  rateLimitAddress(requestOf(context)),
);
