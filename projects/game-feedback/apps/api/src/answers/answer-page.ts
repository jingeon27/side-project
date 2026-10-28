import type { AnswerPage } from '@game-feedback/contracts';

import { ACTIVE_CONTENT } from '../common/content';
import { ApiError } from '../common/http/api-error';
import type { Prisma, PrismaClient } from '../generated/prisma';
import { authorSelect } from '../users/user.presenter';
import { responseAnswer } from './answer.presenter';

/** 상세에 싣는 첫 답변 수. 다음 답변은 `GET /api/posts/:id/answers`로 받는다. */
export const ANSWER_PAGE = 30;

interface IAnswerPosition {
  helpful: boolean;
  createdAt: Date;
  id: string;
}

export function encodeAnswerCursor(answer: IAnswerPosition) {
  return Buffer.from(JSON.stringify([answer.helpful, answer.createdAt.toISOString(), answer.id])).toString(
    'base64url',
  );
}
export function decodeAnswerCursor(value?: string): IAnswerPosition | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      typeof parsed[0] !== 'boolean' ||
      typeof parsed[1] !== 'string' ||
      typeof parsed[2] !== 'string' ||
      !parsed[2] ||
      Number.isNaN(Date.parse(parsed[1]))
    )
      throw new Error();
    return { helpful: parsed[0], createdAt: new Date(parsed[1]), id: parsed[2] };
  } catch {
    throw new ApiError(400, 'INVALID_CURSOR', '목록 위치가 올바르지 않습니다.');
  }
}

/** 도움됨 → 오래된 순 → id 순서에서 `cursor` 다음 위치의 답변. */
export function afterAnswer(cursor: IAnswerPosition): Prisma.AnswerWhereInput {
  const later = {
    OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
  };
  return cursor.helpful
    ? { OR: [{ helpful: true, ...later }, { helpful: false }] }
    : { helpful: false, ...later };
}

/** 글의 보이는 답변 한 페이지. 상세 첫 페이지와 이어 받기가 같은 순서·가시성을 쓴다. */
export async function answerPage(
  db: Pick<PrismaClient, 'answer'>,
  postId: string,
  excluded: string[],
  options: { cursor?: string; limit: number },
): Promise<AnswerPage> {
  const cursor = decodeAnswerCursor(options.cursor);
  const rows = await db.answer.findMany({
    where: {
      postId,
      ...ACTIVE_CONTENT,
      authorId: { notIn: excluded },
      ...(cursor ? { AND: [afterAnswer(cursor)] } : {}),
    },
    include: { author: { select: authorSelect } },
    orderBy: [{ helpful: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: options.limit + 1,
  });
  const page = rows.slice(0, options.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(responseAnswer),
    nextCursor: rows.length > options.limit && last ? encodeAnswerCursor(last) : null,
  };
}
