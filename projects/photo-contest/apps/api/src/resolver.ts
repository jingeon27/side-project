import { Args, Context, Mutation, Query, Resolver, Scalar } from '@nestjs/graphql';
import type { CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ContestService } from './contest.service';
import { fail } from './policy';
@Scalar('DateTime')
export class DateTimeScalar implements CustomScalar<string, Date> {
  description = 'ISO 8601 timestamp';
  parseValue(value: unknown) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
      fail('올바른 날짜를 입력해 주세요.');
    return new Date(value);
  }
  serialize(value: unknown) {
    if (!(value instanceof Date)) fail('날짜 처리 오류', 'INTERNAL_SERVER_ERROR');
    return value.toISOString();
  }
  parseLiteral(ast: ValueNode) {
    if (ast.kind !== Kind.STRING) fail('날짜는 문자열이어야 합니다.');
    return this.parseValue(ast.value);
  }
}
@Resolver()
export class ContestResolver {
  constructor(
    private readonly service: ContestService,
    private readonly auth: AuthService,
  ) {}
  private async uid(req: Request) {
    return this.service.requireUser(await this.auth.user(req)).id;
  }
  @Query() me(@Context('req') req: Request) {
    return this.auth.user(req);
  }
  @Query() async myGroups(@Context('req') req: Request) {
    return this.service.myGroups(await this.uid(req));
  }
  @Query() async group(@Context('req') req: Request, @Args('id') id: string) {
    return this.service.group(await this.uid(req), id);
  }
  @Query() async contest(@Context('req') req: Request, @Args('id') id: string) {
    return this.service.contest(await this.uid(req), id);
  }
  @Query() async submissions(
    @Context('req') req: Request,
    @Args('contestId') id: string,
    @Args('offset') offset: number,
    @Args('limit') limit: number,
  ) {
    return this.service.submissions(await this.uid(req), id, offset, limit);
  }
  @Query() async contestResults(@Context('req') req: Request, @Args('contestId') id: string) {
    return this.service.results(await this.uid(req), id);
  }
  @Mutation() async createGroup(@Context('req') req: Request, @Args('name') name: string) {
    return this.service.createGroup(await this.uid(req), name);
  }
  @Mutation() async joinGroup(@Context('req') req: Request, @Args('token') token: string) {
    return this.service.joinGroup(await this.uid(req), token);
  }
  @Mutation() async createContest(
    @Context('req') req: Request,
    @Args()
    args: { groupId: string; title: string; startsAt: string; submissionEndsAt: string; endsAt: string },
  ) {
    return this.service.createContest(await this.uid(req), args);
  }
  @Mutation() async requestUploadUrl(@Context('req') req: Request, @Args('contestId') id: string) {
    return this.service.requestUploadUrl(await this.uid(req), id);
  }
  @Mutation() async createSubmission(
    @Context('req') req: Request,
    @Args() args: { contestId: string; uploadId: string; caption: string; rightsConfirmed: boolean },
  ) {
    return this.service.createSubmission(
      await this.uid(req),
      args.contestId,
      args.uploadId,
      args.caption,
      args.rightsConfirmed,
    );
  }
  @Mutation() async castVote(
    @Context('req') req: Request,
    @Args('contestId') id: string,
    @Args('submissionId') submissionId: string,
  ) {
    return this.service.castVote(await this.uid(req), id, submissionId);
  }
  @Mutation() async reportSubmission(
    @Context('req') req: Request,
    @Args('submissionId') id: string,
    @Args('reason') reason: string,
  ) {
    return this.service.report(await this.uid(req), id, reason);
  }
  @Mutation() async hideSubmission(@Context('req') req: Request, @Args('submissionId') id: string) {
    return this.service.moderate(await this.uid(req), id, false);
  }
  @Mutation() async deleteSubmission(@Context('req') req: Request, @Args('submissionId') id: string) {
    return this.service.moderate(await this.uid(req), id, true);
  }
}
