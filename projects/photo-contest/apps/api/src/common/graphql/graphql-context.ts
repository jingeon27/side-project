import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import type { Request, Response } from 'express';

export interface IGraphqlContext {
  req: Request;
  res: Response;
}

/** 세션 조회가 REST와 같은 Express 요청 객체를 쓰도록 req를 그대로 넘긴다. */
export function createGraphqlContext({ req, res }: IGraphqlContext): IGraphqlContext {
  return { req, res };
}

/** REST 핸들러든 GraphQL 리졸버든 Express 요청을 꺼낸다. */
export function requestOf(context: ExecutionContext): Request {
  if (context.getType<GqlContextType>() === 'graphql')
    return GqlExecutionContext.create(context).getContext<IGraphqlContext>().req;
  return context.switchToHttp().getRequest<Request>();
}
