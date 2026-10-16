import 'reflect-metadata';
import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  Res,
  type ArgumentsHost,
  type ExceptionFilter,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import { PrismaClient } from './generated/prisma';
import { GameService, type SessionRequest } from './service';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import { ChatController } from './chat.controller';
import { RequestRateLimiter, requestRateBucket } from './rate-limit';
import {
  ApiError,
  assertDatabaseUrl,
  assertOrigin,
  DemoProfileProvider,
  GoogleIdentityProvider,
  SupercellProfileProvider,
  type IdentityProvider,
  type ProfileProvider,
} from './security';

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const data = error.getResponse();
      if (typeof data === 'object' && data && 'errorCode' in data) {
        res.status(error.getStatus()).json(data);
        return;
      }
      res.status(error.getStatus()).json({
        errorCode: error.getStatus() === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
        message: '요청을 처리할 수 없습니다.',
      });
      return;
    }
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'P2002') {
      res.status(409).json({ errorCode: 'CONFLICT', message: '이미 등록된 정보입니다.' });
      return;
    }
    if (code === 'P2025') {
      res.status(404).json({ errorCode: 'NOT_FOUND', message: '대상을 찾을 수 없습니다.' });
      return;
    }
    console.error('Game Feedback API request failed', error instanceof Error ? error.name : 'UnknownError');
    res
      .status(500)
      .json({ errorCode: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
@Controller('api')
class GameController {
  constructor(@Inject(GameService) private readonly service: GameService) {}
  @Get('health') async health() {
    await this.service.db.$queryRaw`SELECT 1`;
    return { ok: true };
  }
  @Get('session') session(@Req() r: SessionRequest) {
    return this.service.session(r);
  }
  @HttpCode(200) @Post('auth/demo') demo(
    @Req() r: SessionRequest,
    @Res({ passthrough: true }) s: Response,
    @Body() b: unknown,
  ) {
    return this.service.demo(r, s, b);
  }
  @Get('auth/test-accounts') testAccounts() {
    return this.service.testAccounts();
  }
  @HttpCode(200) @Post('auth/test-login') testLogin(
    @Req() r: SessionRequest,
    @Res({ passthrough: true }) s: Response,
    @Body() b: unknown,
  ) {
    return this.service.testLogin(r, s, b);
  }
  @Patch('admin/users/:id/verification') setVerification(
    @Req() r: SessionRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.setVerification(r, id, b);
  }
  @Get('auth/google') google(@Req() r: Request, @Res() s: Response) {
    return this.service.google(r, s);
  }
  @Get('auth/google/callback') callback(@Req() r: SessionRequest, @Res() s: Response) {
    return this.service.googleCallback(r, s);
  }
  @HttpCode(200) @Post('auth/onboard') onboard(
    @Req() r: SessionRequest,
    @Res({ passthrough: true }) s: Response,
    @Body() b: unknown,
  ) {
    return this.service.onboard(r, s, b);
  }
  @HttpCode(200) @Post('auth/logout') logout(
    @Req() r: SessionRequest,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.service.logout(r, s);
  }
  @Delete('me') account(@Req() r: SessionRequest, @Res({ passthrough: true }) s: Response) {
    return this.service.deleteAccount(r, s);
  }
  @Get('categories') categories() {
    return this.service.categories();
  }
  @Get('posts') posts(@Req() r: SessionRequest) {
    return this.service.listPosts(r);
  }
  @HttpCode(200) @Post('posts') createPost(@Req() r: SessionRequest, @Body() b: unknown) {
    return this.service.createPost(r, b);
  }
  @Get('posts/:id') post(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.detail(r, id);
  }
  @Patch('posts/:id') updatePost(@Req() r: SessionRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.updatePost(r, id, b);
  }
  @Delete('posts/:id') deletePost(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.deletePost(r, id);
  }
  @HttpCode(200) @Post('posts/:id/answers') answer(
    @Req() r: SessionRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.createAnswer(r, id, b);
  }
  @Patch('answers/:id') editAnswer(@Req() r: SessionRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.updateAnswer(r, id, b);
  }
  @Delete('answers/:id') deleteAnswer(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.deleteAnswer(r, id);
  }
  @HttpCode(200) @Post('answers/:id/helpful') helpful(
    @Req() r: SessionRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.helpful(r, id, b);
  }
  @HttpCode(200) @Post('posts/:id/read') read(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.readPost(r, id);
  }
  @HttpCode(200) @Post('posts/:id/comments') comment(
    @Req() r: SessionRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.createComment(r, id, b);
  }
  @Patch('comments/:id') editComment(@Req() r: SessionRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.updateComment(r, id, b);
  }
  @Delete('comments/:id') deleteComment(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.deleteComment(r, id);
  }
  @Get('game-profiles/:playerTag') profile(@Param('playerTag') tag: string) {
    return this.service.lookup(tag);
  }
  @Get('me/game-accounts') accounts(@Req() r: SessionRequest) {
    return this.service.gameAccounts(r);
  }
  @HttpCode(200) @Post('me/game-accounts') addAccount(@Req() r: SessionRequest, @Body() b: unknown) {
    return this.service.saveGameAccount(r, b);
  }
  @Get('notifications') notifications(@Req() r: SessionRequest) {
    return this.service.notifications(r);
  }
  @HttpCode(200) @Post('notifications/read-all') readAll(@Req() r: SessionRequest) {
    return this.service.readNotification(r);
  }
  @HttpCode(200) @Post('notifications/:id/read') readOne(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.readNotification(r, id);
  }
  @HttpCode(200) @Post('reports') report(@Req() r: SessionRequest, @Body() b: unknown) {
    return this.service.report(r, b);
  }
  @Get('blocks') blocks(@Req() r: SessionRequest) {
    return this.service.blocks(r);
  }
  @HttpCode(200) @Post('blocks') block(@Req() r: SessionRequest, @Body() b: unknown) {
    return this.service.block(r, b);
  }
  @Delete('blocks/:id') unblock(@Req() r: SessionRequest, @Param('id') id: string) {
    return this.service.unblock(r, id);
  }
  @HttpCode(200) @Post('admin/categories') category(@Req() r: SessionRequest, @Body() b: unknown) {
    return this.service.category(r, b);
  }
  @HttpCode(200) @Post('admin/hide') hide(@Req() r: SessionRequest, @Body() b: unknown) {
    return this.service.hide(r, b);
  }
  @Get('admin/reports') reports(@Req() r: SessionRequest) {
    return this.service.reports(r);
  }
}
export interface AppOptions {
  databaseUrl?: string;
  webOrigin?: string;
  demoMode?: boolean;
  identityProvider?: IdentityProvider;
  profileProvider?: ProfileProvider;
  rateLimit?: boolean;
  logger?: false;
  prisma?: PrismaClient;
}
export async function createApp(options: AppOptions = {}): Promise<INestApplication> {
  const production = process.env.NODE_ENV === 'production';
  const demoMode = options.demoMode ?? process.env.GF_DEMO_MODE === 'true';
  if (production && demoMode) throw new Error('GF_DEMO_MODE is forbidden in production.');
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:3300';
  if (new URL(webOrigin).origin !== webOrigin)
    throw new Error('WEB_ORIGIN must be an origin without a path.');
  if (production && !webOrigin.startsWith('https://'))
    throw new Error('Production WEB_ORIGIN must use HTTPS.');
  const databaseUrl = assertDatabaseUrl(options.databaseUrl ?? process.env.DATABASE_URL);
  const db = options.prisma ?? new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const identityProvider =
    options.identityProvider ??
    (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? new GoogleIdentityProvider(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI ?? `${webOrigin}/api/auth/google/callback`,
        )
      : undefined);
  const profileProvider =
    options.profileProvider ??
    (demoMode
      ? new DemoProfileProvider()
      : process.env.SUPERCELL_API_TOKEN
        ? new SupercellProfileProvider(process.env.SUPERCELL_API_TOKEN)
        : undefined);
  const service = new GameService(db, { demoMode, production, webOrigin, identityProvider, profileProvider });
  const chatEvents = new ChatEvents(db, demoMode);
  const chatService = new ChatService(service, chatEvents);
  @Module({
    controllers: [GameController, ChatController],
    providers: [
      { provide: GameService, useValue: service },
      { provide: ChatService, useValue: chatService },
      { provide: ChatEvents, useValue: chatEvents },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: options.logger ?? false, bodyParser: false });
  app.useGlobalFilters(new ErrorFilter());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error) {
      res
        .status(error.type === 'entity.too.large' ? 413 : 400)
        .json({ errorCode: 'INVALID_BODY', message: '올바른 JSON 요청을 입력해주세요.' });
      return;
    }
    next(error);
  });
  const limits = new RequestRateLimiter();
  const enforceLimit = (res: Response, key: string, limit: number) => {
    const retryAfter = limits.consume(key, limit);
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      throw new ApiError(429, 'RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해주세요.');
    }
  };
  app.use(async (req: SessionRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.path.startsWith('/api')) return next();
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (mutation) assertOrigin(req, webOrigin);
      const ip = req.ip ?? 'unknown';
      // A coarse network cap bounds session lookups, including forged cookies.
      if (options.rateLimit !== false) enforceLimit(res, `coarse:ip:${ip}`, 1000);
      await service.loadSession(req);
      if (options.rateLimit !== false) {
        const bucket = requestRateBucket({
          ip,
          userId: req.gfSession?.user?.id,
          path: req.path,
          method: req.method,
        });
        enforceLimit(res, bucket.key, bucket.limit);
      }
      // Hooks run only after successful REST responses, when the database mutation has committed.
      const userId = req.gfSession?.userId;
      const sessionHash = req.gfSession?.tokenHash;
      let deletedPeers: string[] = [];
      if (req.method === 'DELETE' && req.path === '/api/me' && userId) {
        deletedPeers = (
          await db.chatConversation.findMany({
            where: { OR: [{ firstUserId: userId }, { secondUserId: userId }] },
            select: { firstUserId: true, secondUserId: true },
          })
        ).map((row) => (row.firstUserId === userId ? row.secondUserId : row.firstUserId));
      }
      res.once('finish', () => {
        if (res.statusCode !== 200 || !userId) return;
        if (
          req.method === 'POST' &&
          ['/api/auth/logout', '/api/auth/demo', '/api/auth/test-login', '/api/auth/onboard'].includes(
            req.path,
          ) &&
          sessionHash
        )
          chatEvents.closeSession(sessionHash);
        if (req.method === 'DELETE' && req.path === '/api/me') {
          chatEvents.closeUser(userId);
          void chatEvents.publish(deletedPeers, null);
        }
        if (
          req.method === 'POST' &&
          req.path === '/api/blocks' &&
          typeof req.body?.blockedUserId === 'string'
        )
          void chatEvents.publish([userId, req.body.blockedUserId], null);
        if (req.method === 'DELETE' && req.path.startsWith('/api/blocks/'))
          void chatEvents.publish([userId, req.path.slice('/api/blocks/'.length)], null);
      });
      next();
    } catch (error) {
      if (error instanceof ApiError) res.status(error.getStatus()).json(error.getResponse());
      else next(error);
    }
  });
  await app.init();
  const originalClose = app.close.bind(app);
  app.close = async () => {
    chatEvents.closeAll();
    await originalClose();
    if (!options.prisma) await db.$disconnect();
  };
  return app;
}
