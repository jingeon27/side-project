import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  AnswerInputSchema,
  BlockInputSchema,
  CategoryInputSchema,
  CommentInputSchema,
  DemoInputSchema,
  GameAccountInputSchema,
  HelpfulInputSchema,
  HideInputSchema,
  ListQuerySchema,
  OnboardInputSchema,
  PlayerTagSchema,
  PostInputSchema,
  PostPatchSchema,
  ReportInputSchema,
  TestLoginInputSchema,
  VerificationInputSchema,
  type GameProfile,
} from '@game-feedback/contracts';
import { PrismaClient, Prisma } from './generated/prisma';
import { authorDto, authorSelect, userDto } from './users';
import { seed, TEST_ACCOUNT_FIXTURES } from './seed';
import {
  ApiError,
  COOKIE,
  cookies,
  decodeCursor,
  encodeCursor,
  hash,
  setCookie,
  token,
  type IdentityProvider,
  type ProfileProvider,
} from './security';

export interface ServiceOptions {
  demoMode: boolean;
  production: boolean;
  webOrigin: string;
  identityProvider?: IdentityProvider;
  profileProvider?: ProfileProvider;
}
export type SessionRequest = Request & {
  gfSession?: Prisma.SessionGetPayload<{ include: { user: true } }> | null;
};
const active = { hidden: false, deletedAt: null } as const;
const postInclude = {
  author: { select: authorSelect },
  category: true,
  answers: { where: active, select: { id: true, helpful: true } },
} as const;
const responseUser = userDto;
type PostRecord = Prisma.PostGetPayload<{ include: typeof postInclude }>;
type AnswerRecord = Prisma.AnswerGetPayload<{ include: { author: { select: typeof authorSelect } } }>;
type CommentRecord = Prisma.CommentGetPayload<{ include: { author: { select: typeof authorSelect } } }>;
const responsePost = (p: PostRecord) => ({
  id: p.id,
  title: p.title,
  body: p.body,
  categoryId: p.categoryId,
  category: p.category,
  author: authorDto(p.author),
  gameProfile: p.gameProfile,
  answerCount: p.answers.length,
  helpfulCount: p.answers.filter((a) => a.helpful).length,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
const responseAnswer = (a: AnswerRecord) => ({
  id: a.id,
  postId: a.postId,
  body: a.body,
  author: authorDto(a.author),
  helpful: a.helpful,
  readAt: a.readAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});
const responseComment = (c: CommentRecord) => ({
  id: c.id,
  postId: c.postId,
  body: c.body,
  author: authorDto(c.author),
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? '입력값을 확인해주세요.');
  return result.data;
};

export class GameService {
  constructor(
    readonly db: PrismaClient,
    readonly options: ServiceOptions,
  ) {}
  async loadSession(req: SessionRequest) {
    const raw = cookies(req)[COOKIE];
    req.gfSession = raw
      ? await this.db.session.findUnique({ where: { tokenHash: hash(raw) }, include: { user: true } })
      : null;
    if (
      req.gfSession &&
      (req.gfSession.expiresAt.getTime() <= Date.now() ||
        (!this.options.demoMode && req.gfSession.user?.demoKey))
    )
      req.gfSession = null;
  }
  requireUser(req: SessionRequest) {
    const u = req.gfSession?.user;
    if (!u) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    return u;
  }
  requireAdmin(req: SessionRequest) {
    const u = this.requireUser(req);
    if (u.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
    return u;
  }
  session(req: SessionRequest) {
    return {
      user: req.gfSession?.user ? responseUser(req.gfSession.user) : null,
      demoMode: this.options.demoMode,
      googleConfigured: !!this.options.identityProvider,
      needsOnboarding: !!req.gfSession?.pendingSubject,
    };
  }
  async issueSession(
    req: SessionRequest,
    res: Response,
    userId: string | null,
    pendingSubject: string | null = null,
  ) {
    const raw = token(),
      maxAge = userId ? 1000 * 60 * 60 * 24 * 14 : 1000 * 60 * 15;
    const current = cookies(req)[COOKIE];
    await this.db.$transaction(async (tx) => {
      if (current) await tx.session.deleteMany({ where: { tokenHash: hash(current) } });
      await tx.session.create({
        data: { tokenHash: hash(raw), userId, pendingSubject, expiresAt: new Date(Date.now() + maxAge) },
      });
    });
    setCookie(res, COOKIE, raw, maxAge, this.options.production);
    req.gfSession = await this.db.session.findUnique({
      where: { tokenHash: hash(raw) },
      include: { user: true },
    });
  }
  async demo(req: SessionRequest, res: Response, body: unknown) {
    if (!this.options.demoMode) throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
    const input = parse(DemoInputSchema, body);
    const user = await this.db.user.upsert({
      where: { demoKey: `demo:${input.nickname.toLocaleLowerCase()}` },
      update: {},
      create: {
        nickname: input.nickname,
        demoKey: `demo:${input.nickname.toLocaleLowerCase()}`,
        termsVersion: 'demo',
        ageConfirmed: true,
      },
    });
    await this.issueSession(req, res, user.id);
    return this.session(req);
  }
  private requireDemo() {
    if (!this.options.demoMode || this.options.production)
      throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
  }
  async testAccounts() {
    this.requireDemo();
    await seed(this.db, true);
    const users = await this.db.user.findMany({
      where: { OR: TEST_ACCOUNT_FIXTURES.map((account) => ({ id: account.id, demoKey: account.demoKey })) },
    });
    return {
      items: TEST_ACCOUNT_FIXTURES.flatMap((account) => {
        const user = users.find((candidate) => candidate.id === account.id);
        return user
          ? [{ ...authorDto(user), isTestAccount: true, role: user.role, description: account.description }]
          : [];
      }),
    };
  }
  async testLogin(req: SessionRequest, res: Response, body: unknown) {
    this.requireDemo();
    const { accountId } = parse(TestLoginInputSchema, body);
    const fixture = TEST_ACCOUNT_FIXTURES.find((account) => account.id === accountId);
    if (!fixture) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '사용할 수 없는 테스트 계정입니다.');
    await seed(this.db, true);
    const user = await this.db.user.findFirst({ where: { id: fixture.id, demoKey: fixture.demoKey } });
    if (!user) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '테스트 계정을 찾을 수 없습니다.');
    await this.issueSession(req, res, user.id);
    return this.session(req);
  }
  async setVerification(req: SessionRequest, id: string, body: unknown) {
    const admin = this.requireAdmin(req),
      input = parse(VerificationInputSchema, body);
    const user = await this.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      const updated = await tx.user.update({
        where: { id },
        data: {
          isVerified: input.isVerified,
          verifiedAt: input.isVerified ? (target.verifiedAt ?? new Date()) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: input.isVerified ? 'VERIFY_USER' : 'UNVERIFY_USER',
          targetType: 'USER',
          targetId: id,
          detail: '서비스 사용자 인증 상태 변경',
        },
      });
      return updated;
    });
    return userDto(user);
  }
  async google(req: Request, res: Response) {
    if (!this.options.identityProvider)
      throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'Google 로그인이 아직 설정되지 않았습니다.');
    const state = token(),
      nonce = token(),
      verifier = token();
    await this.db.oAuthAttempt.create({
      data: { stateHash: hash(state), nonce, verifier, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
    });
    setCookie(res, 'gamefeedback_oauth', state, 1000 * 60 * 10, this.options.production);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    res.redirect(this.options.identityProvider.authorizationUrl({ state, nonce, challenge }));
  }
  async googleCallback(req: SessionRequest, res: Response) {
    if (!this.options.identityProvider)
      throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'Google 로그인이 아직 설정되지 않았습니다.');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || !code || cookies(req).gamefeedback_oauth !== state)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청을 확인할 수 없습니다.');
    const attempts = await this.db.oAuthAttempt.deleteMany({
      where: { stateHash: hash(state), expiresAt: { lte: new Date() } },
    });
    void attempts;
    const attempt = await this.db.oAuthAttempt.findUnique({ where: { stateHash: hash(state) } });
    if (!attempt) throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 만료되었습니다.');
    // Consume before exchanging the one-use code, including failures.
    const consumed = await this.db.oAuthAttempt.deleteMany({ where: { stateHash: hash(state) } });
    if (consumed.count !== 1)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 이미 사용되었습니다.');
    setCookie(res, 'gamefeedback_oauth', '', 0, this.options.production);
    const subject = await this.options.identityProvider.exchange(code, attempt.verifier, attempt.nonce);
    const user = await this.db.user.findUnique({ where: { googleSubject: subject } });
    if (user && process.env.GF_ADMIN_GOOGLE_SUB === subject && user.role !== 'ADMIN') {
      await this.db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    }
    await this.issueSession(req, res, user?.id ?? null, user ? null : subject);
    res.redirect(`${this.options.webOrigin}/ko${user ? '' : '?onboard=1'}`);
  }
  async onboard(req: SessionRequest, res: Response, body: unknown) {
    const input = parse(OnboardInputSchema, body),
      subject = req.gfSession?.pendingSubject;
    if (!subject) throw new ApiError(401, 'ONBOARDING_REQUIRED', 'Google 로그인 후 가입을 완료해주세요.');
    const user = await this.db.user.upsert({
      where: { googleSubject: subject },
      update: {},
      create: {
        googleSubject: subject,
        nickname: input.nickname,
        termsVersion: '2026-10-16',
        ageConfirmed: true,
        role: process.env.GF_ADMIN_GOOGLE_SUB === subject ? 'ADMIN' : 'USER',
      },
    });
    await this.issueSession(req, res, user.id);
    return this.session(req);
  }
  async logout(req: SessionRequest, res: Response) {
    const raw = cookies(req)[COOKIE];
    if (raw) await this.db.session.deleteMany({ where: { tokenHash: hash(raw) } });
    setCookie(res, COOKIE, '', 0, this.options.production);
    return { ok: true };
  }
  async deleteAccount(req: SessionRequest, res: Response) {
    const u = this.requireUser(req);
    await this.db.$transaction(async (tx) => {
      await tx.post.deleteMany({ where: { authorId: u.id } });
      await tx.answer.deleteMany({ where: { authorId: u.id } });
      await tx.comment.deleteMany({ where: { authorId: u.id } });
      await tx.notification.deleteMany({ where: { actorId: u.id } });
      await tx.user.delete({ where: { id: u.id } });
    });
    setCookie(res, COOKIE, '', 0, this.options.production);
    return { ok: true };
  }
  categories() {
    return this.db.category.findMany({ where: { active: true }, orderBy: { slug: 'asc' } });
  }
  async excluded(req: SessionRequest) {
    const demoAuthors = this.options.demoMode
      ? []
      : await this.db.user.findMany({ where: { demoKey: { not: null } }, select: { id: true } });
    const excluded = demoAuthors.map((user) => user.id);
    const u = req.gfSession?.user;
    if (!u) return excluded;
    const rows = await this.db.block.findMany({ where: { OR: [{ userId: u.id }, { blockedUserId: u.id }] } });
    return [...new Set([...excluded, ...rows.map((b) => (b.userId === u.id ? b.blockedUserId : b.userId))])];
  }
  async visiblePost(req: SessionRequest, id: string) {
    const excluded = await this.excluded(req);
    const post = await this.db.post.findFirst({
      where: { id, ...active, authorId: { notIn: excluded } },
      include: {
        ...postInclude,
        answers: { where: { ...active, authorId: { notIn: excluded } }, select: { id: true, helpful: true } },
      },
    });
    if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
    return post;
  }
  async listPosts(req: SessionRequest) {
    const q = parse(ListQuerySchema, req.query),
      cursor = decodeCursor(q.cursor),
      excluded = await this.excluded(req);
    const where: Prisma.PostWhereInput = {
      ...active,
      authorId: { notIn: excluded },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.unanswered === 'true' ? { answers: { none: { ...active, authorId: { notIn: excluded } } } } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { body: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    if (cursor)
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    const rows = await this.db.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: {
        ...postInclude,
        answers: { where: { ...active, authorId: { notIn: excluded } }, select: { id: true, helpful: true } },
      },
    });
    const more = rows.length > q.limit,
      items = rows.slice(0, q.limit);
    return {
      items: items.map(responsePost),
      nextCursor: more ? encodeCursor(items[items.length - 1]) : null,
    };
  }
  async detail(req: SessionRequest, id: string) {
    const p = await this.visiblePost(req, id),
      excluded = await this.excluded(req);
    const [answers, comments] = await Promise.all([
      this.db.answer.findMany({
        where: { postId: id, ...active, authorId: { notIn: excluded } },
        include: { author: { select: authorSelect } },
        orderBy: [{ helpful: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.comment.findMany({
        where: { postId: id, ...active, authorId: { notIn: excluded } },
        include: { author: { select: authorSelect } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      post: responsePost({ ...p, answers }),
      answers: answers.map(responseAnswer),
      comments: comments.map(responseComment),
    };
  }
  async lookup(tag: unknown) {
    const playerTag = parse(PlayerTagSchema, tag);
    if (!this.options.profileProvider)
      throw new ApiError(503, 'PROFILE_UNAVAILABLE', '게임 API가 아직 설정되지 않았습니다.');
    return this.options.profileProvider.lookup(playerTag);
  }
  async gameAccounts(req: SessionRequest) {
    const u = this.requireUser(req);
    return (
      await this.db.gameAccount.findMany({ where: { userId: u.id }, orderBy: { updatedAt: 'desc' } })
    ).map((a) => a.profile);
  }
  async saveGameAccount(req: SessionRequest, body: unknown) {
    const u = this.requireUser(req),
      input = parse(GameAccountInputSchema, body),
      profile = await this.lookup(input.playerTag);
    await this.db.$transaction([
      this.db.gameAccount.upsert({
        where: { userId_playerTag: { userId: u.id, playerTag: input.playerTag } },
        update: { profile: profile as unknown as Prisma.InputJsonValue },
        create: {
          userId: u.id,
          playerTag: input.playerTag,
          profile: profile as unknown as Prisma.InputJsonValue,
        },
      }),
      this.db.user.update({ where: { id: u.id }, data: { supercellTag: input.playerTag } }),
    ]);
    return profile;
  }
  async createPost(req: SessionRequest, body: unknown) {
    const u = this.requireUser(req),
      input = parse(PostInputSchema, body);
    const category = await this.db.category.findFirst({ where: { id: input.categoryId, active: true } });
    if (!category) throw new ApiError(400, 'INVALID_CATEGORY', '카테고리를 확인해주세요.');
    let profile: GameProfile | undefined;
    if (input.playerTag) profile = await this.lookup(input.playerTag);
    const p = await this.db.post.create({
      data: {
        authorId: u.id,
        categoryId: category.id,
        title: input.title,
        body: input.body,
        ...(profile ? { gameProfile: profile as unknown as Prisma.InputJsonValue } : {}),
      },
      include: postInclude,
    });
    return responsePost(p);
  }
  async updatePost(req: SessionRequest, id: string, body: unknown) {
    const u = this.requireUser(req),
      input = parse(PostPatchSchema, body),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    const { playerTag, ...data } = input;
    const excluded = await this.excluded(req);
    const gameProfile = playerTag ? await this.lookup(playerTag) : undefined;
    return responsePost(
      await this.db.post.update({
        where: { id },
        data: {
          ...data,
          ...(gameProfile ? { gameProfile: gameProfile as unknown as Prisma.InputJsonValue } : {}),
        },
        include: {
          ...postInclude,
          answers: {
            where: { ...active, authorId: { notIn: excluded } },
            select: { id: true, helpful: true },
          },
        },
      }),
    );
  }
  async deletePost(req: SessionRequest, id: string) {
    const u = this.requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.db.$transaction([
      this.db.post.update({
        where: { id },
        data: { deletedAt: new Date(), title: '삭제된 요청', body: '', gameProfile: Prisma.DbNull },
      }),
      this.db.notification.deleteMany({ where: { postId: id } }),
    ]);
    return { ok: true };
  }
  async createAnswer(req: SessionRequest, postId: string, body: unknown) {
    const u = this.requireUser(req),
      input = parse(AnswerInputSchema, body),
      p = await this.visiblePost(req, postId);
    const a = await this.db.$transaction(async (tx) => {
      const row = await tx.answer.create({
        data: { postId, authorId: u.id, body: input.body },
        include: { author: { select: authorSelect } },
      });
      if (p.authorId !== u.id)
        await tx.notification.create({
          data: {
            actorId: u.id,
            userId: p.authorId,
            postId,
            answerId: row.id,
            type: 'ANSWER',
            message: `${u.nickname}님이 피드백을 남겼어요.`,
          },
        });
      return row;
    });
    return responseAnswer(a);
  }
  async visibleAnswer(req: SessionRequest, id: string) {
    const a = await this.db.answer.findFirst({
      where: { id, ...active },
      include: { author: { select: authorSelect } },
    });
    if (!a) throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    await this.visiblePost(req, a.postId);
    if ((await this.excluded(req)).includes(a.authorId))
      throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    return a;
  }
  async updateAnswer(req: SessionRequest, id: string, body: unknown) {
    const u = this.requireUser(req),
      input = parse(AnswerInputSchema, body),
      a = await this.visibleAnswer(req, id);
    if (a.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseAnswer(
      await this.db.answer.update({
        where: { id },
        data: { body: input.body, readAt: null, helpful: false },
        include: { author: { select: authorSelect } },
      }),
    );
  }
  async deleteAnswer(req: SessionRequest, id: string) {
    const u = this.requireUser(req),
      a = await this.visibleAnswer(req, id);
    if (a.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.db.$transaction([
      this.db.answer.update({ where: { id }, data: { deletedAt: new Date(), body: '', helpful: false } }),
      this.db.notification.deleteMany({ where: { answerId: id } }),
    ]);
    return { ok: true };
  }
  async helpful(req: SessionRequest, id: string, body: unknown) {
    const u = this.requireUser(req),
      input = parse(HelpfulInputSchema, body),
      a = await this.visibleAnswer(req, id),
      p = await this.visiblePost(req, a.postId);
    if (p.authorId !== u.id || a.authorId === u.id)
      throw new ApiError(403, 'FORBIDDEN', '요청자만 다른 사용자의 답변에 도움됨을 표시할 수 있습니다.');
    const row = await this.db.$transaction(async (tx) => {
      const changed = await tx.answer.updateMany({
        where: { id, helpful: !input.helpful },
        data: { helpful: input.helpful, readAt: new Date() },
      });
      if (input.helpful && changed.count)
        await tx.notification.create({
          data: {
            actorId: u.id,
            userId: a.authorId,
            postId: a.postId,
            answerId: a.id,
            type: 'HELPFUL',
            message: `${u.nickname}님이 피드백을 도움됨으로 표시했어요.`,
          },
        });
      return tx.answer.findUniqueOrThrow({ where: { id }, include: { author: { select: authorSelect } } });
    });
    return responseAnswer(row);
  }
  async readPost(req: SessionRequest, id: string) {
    const u = this.requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '요청자만 답변을 확인할 수 있습니다.');
    await this.db.$transaction([
      this.db.answer.updateMany({
        where: { postId: id, readAt: null, ...active },
        data: { readAt: new Date() },
      }),
      this.db.notification.updateMany({
        where: { userId: u.id, postId: id, readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
    return { ok: true };
  }
  async createComment(req: SessionRequest, postId: string, body: unknown) {
    const u = this.requireUser(req),
      input = parse(CommentInputSchema, body),
      p = await this.visiblePost(req, postId);
    const c = await this.db.$transaction(async (tx) => {
      const row = await tx.comment.create({
        data: { postId, authorId: u.id, body: input.body },
        include: { author: { select: authorSelect } },
      });
      if (p.authorId !== u.id)
        await tx.notification.create({
          data: {
            actorId: u.id,
            userId: p.authorId,
            postId,
            type: 'COMMENT',
            message: `${u.nickname}님이 댓글을 남겼어요.`,
          },
        });
      return row;
    });
    return responseComment(c);
  }
  async visibleComment(req: SessionRequest, id: string) {
    const c = await this.db.comment.findFirst({
      where: { id, ...active },
      include: { author: { select: authorSelect } },
    });
    if (!c) throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    await this.visiblePost(req, c.postId);
    if ((await this.excluded(req)).includes(c.authorId))
      throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    return c;
  }
  async updateComment(req: SessionRequest, id: string, body: unknown) {
    const u = this.requireUser(req),
      input = parse(CommentInputSchema, body),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseComment(
      await this.db.comment.update({
        where: { id },
        data: input,
        include: { author: { select: authorSelect } },
      }),
    );
  }
  async deleteComment(req: SessionRequest, id: string) {
    const u = this.requireUser(req),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.db.comment.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
    return { ok: true };
  }
  async notifications(req: SessionRequest) {
    const u = this.requireUser(req),
      q = parse(ListQuerySchema, req.query),
      cursor = decodeCursor(q.cursor),
      excluded = await this.excluded(req);
    const visible: Prisma.NotificationWhereInput = {
      OR: [{ actorId: null }, { actorId: { notIn: excluded } }],
    };
    const where: Prisma.NotificationWhereInput = {
      AND: [visible],
      userId: u.id,
      post: { ...active, authorId: { notIn: excluded } },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const [rows, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
      }),
      this.db.notification.count({
        where: {
          AND: [visible],
          userId: u.id,
          readAt: null,
          post: { ...active, authorId: { notIn: excluded } },
        },
      }),
    ]);
    const items = rows.slice(0, q.limit);
    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        postId: n.postId,
        answerId: n.answerId,
        message: n.message,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      nextCursor: rows.length > q.limit ? encodeCursor(items[items.length - 1]) : null,
    };
  }
  async readNotification(req: SessionRequest, id?: string) {
    const u = this.requireUser(req);
    const result = await this.db.notification.updateMany({
      where: { userId: u.id, ...(id ? { id } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    if (id && !result.count && !(await this.db.notification.findFirst({ where: { id, userId: u.id } })))
      throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
    return { ok: true };
  }
  async report(req: SessionRequest, body: unknown) {
    const u = this.requireUser(req),
      input = parse(ReportInputSchema, body);
    if (input.targetType === 'POST') await this.visiblePost(req, input.targetId);
    else if (input.targetType === 'ANSWER') await this.visibleAnswer(req, input.targetId);
    else await this.visibleComment(req, input.targetId);
    await this.db.report.upsert({
      where: {
        reporterId_targetType_targetId: {
          reporterId: u.id,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      update: {},
      create: { reporterId: u.id, ...input },
    });
    return { ok: true };
  }
  async blocks(req: SessionRequest) {
    const u = this.requireUser(req);
    return (
      await this.db.block.findMany({
        where: { userId: u.id },
        include: { blockedUser: { select: authorSelect } },
      })
    ).map((b) => authorDto(b.blockedUser));
  }
  async block(req: SessionRequest, body: unknown) {
    const u = this.requireUser(req),
      input = parse(BlockInputSchema, body);
    if (input.blockedUserId === u.id)
      throw new ApiError(400, 'CANNOT_BLOCK_SELF', '자신은 차단할 수 없습니다.');
    if (!(await this.db.user.findUnique({ where: { id: input.blockedUserId } })))
      throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    await this.db.$transaction([
      this.db.block.upsert({
        where: { userId_blockedUserId: { userId: u.id, blockedUserId: input.blockedUserId } },
        update: {},
        create: { userId: u.id, ...input },
      }),
      this.db.notification.deleteMany({
        where: {
          OR: [
            { userId: u.id, actorId: input.blockedUserId },
            { userId: input.blockedUserId, actorId: u.id },
          ],
        },
      }),
    ]);
    return { ok: true };
  }
  async unblock(req: SessionRequest, id: string) {
    const u = this.requireUser(req);
    await this.db.block.deleteMany({ where: { userId: u.id, blockedUserId: id } });
    return { ok: true };
  }
  async category(req: SessionRequest, body: unknown) {
    const u = this.requireAdmin(req),
      input = parse(CategoryInputSchema, body);
    return this.db.$transaction(async (tx) => {
      const c = await tx.category.create({ data: input });
      await tx.auditLog.create({
        data: {
          actorId: u.id,
          action: 'CREATE_CATEGORY',
          targetType: 'CATEGORY',
          targetId: c.id,
          detail: input.name,
        },
      });
      return c;
    });
  }
  async hide(req: SessionRequest, body: unknown) {
    const u = this.requireAdmin(req),
      input = parse(HideInputSchema, body);
    await this.db.$transaction(async (tx) => {
      const data = { hidden: input.hidden };
      if (input.targetType === 'POST') await tx.post.update({ where: { id: input.targetId }, data });
      else if (input.targetType === 'ANSWER') await tx.answer.update({ where: { id: input.targetId }, data });
      else await tx.comment.update({ where: { id: input.targetId }, data });
      if (input.hidden) {
        if (input.targetType === 'POST')
          await tx.notification.deleteMany({ where: { postId: input.targetId } });
        else if (input.targetType === 'ANSWER')
          await tx.notification.deleteMany({ where: { answerId: input.targetId } });
      }
      await tx.auditLog.create({
        data: {
          actorId: u.id,
          action: input.hidden ? 'HIDE' : 'UNHIDE',
          targetType: input.targetType,
          targetId: input.targetId,
          detail: input.reason,
        },
      });
    });
    return { ok: true };
  }
  async reports(req: SessionRequest) {
    this.requireAdmin(req);
    return this.db.report.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
