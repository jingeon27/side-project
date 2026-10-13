import { Injectable } from '@nestjs/common';
import { Prisma, User } from '../generated/prisma';
import { createHash, randomBytes } from 'node:crypto';
import { Database } from './database';
import { contestDates, fail, phase, textValue } from './policy';
import { recordEvent } from './analytics';
import { deletePhoto } from './storage';
export function token() {
  return randomBytes(32).toString('base64url');
}
export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
const submissionInclude = {
  author: true,
  upload: true,
  reports: { select: { id: true, reason: true, createdAt: true } },
  _count: { select: { votes: true, reports: true } },
} satisfies Prisma.SubmissionInclude;
type SubmissionRow = Prisma.SubmissionGetPayload<{ include: typeof submissionInclude }>;
type Client = Prisma.TransactionClient;
@Injectable()
export class ContestService {
  constructor(private readonly db: Database) {}
  async member(client: Client, userId: string, groupId: string, admin = false) {
    const member = await client.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!member || (admin && member.role !== 'OWNER')) fail('이 그룹에 접근할 권한이 없습니다.', 'FORBIDDEN');
    return member;
  }
  async accessibleContest(client: Client, userId: string, contestId: string, admin = false) {
    const contest = await client.contest.findUnique({ where: { id: contestId } });
    if (!contest) fail('대회를 찾을 수 없습니다.', 'NOT_FOUND');
    const member = await this.member(client, userId, contest.groupId, admin);
    return { contest, member };
  }
  requireUser(user: User | null): User {
    return user ?? fail('먼저 로그인해 주세요.', 'UNAUTHENTICATED');
  }
  presentSubmission(row: SubmissionRow, completed: boolean, admin: boolean) {
    return {
      id: row.id,
      author: row.author,
      caption: row.caption,
      hidden: row.hidden,
      createdAt: row.createdAt,
      imageUrl: `/backend/photos/${row.id}`,
      voteCount: completed ? row._count.votes : null,
      reportCount: admin ? row._count.reports : null,
      reports: admin ? row.reports : null,
    };
  }
  async group(userId: string, id: string) {
    const member = await this.member(this.db, userId, id);
    const group = await this.db.group.findUniqueOrThrow({
      where: { id },
      include: {
        members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        contests: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    return {
      id: group.id,
      name: group.name,
      role: member.role,
      inviteToken: member.role === 'OWNER' ? group.inviteToken : null,
      members: group.members,
      contests: group.contests.map((c) => ({
        ...c,
        phase: phase(c),
        isAdmin: member.role === 'OWNER',
        submissions: [],
      })),
    };
  }
  async myGroups(userId: string) {
    const memberships = await this.db.groupMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
    });
    return Promise.all(memberships.map((m) => this.group(userId, m.groupId)));
  }
  async createGroup(userId: string, name: string) {
    const inviteToken = token();
    const validName = textValue(name, 40, '그룹 이름');
    const group = await this.db.atomic(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: validName,
          inviteToken,
          inviteHash: hash(inviteToken),
          members: { create: { userId, role: 'OWNER' } },
        },
      });
      await recordEvent(tx, `group:${created.id}`, 'group_created', userId, { groupId: created.id });
      return created;
    });
    return this.group(userId, group.id);
  }
  async joinGroup(userId: string, invite: string) {
    const group = await this.db.group.findUnique({
      where: { inviteHash: hash(textValue(invite, 100, '초대 코드')) },
    });
    if (!group) fail('유효하지 않은 초대 링크입니다.', 'NOT_FOUND');
    await this.db.atomic(async (tx) => {
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId },
        update: {},
      });
      await recordEvent(tx, `joined:${group.id}:${userId}`, 'group_joined', userId, { groupId: group.id });
    });
    return this.group(userId, group.id);
  }
  async contest(userId: string, id: string) {
    const { contest, member } = await this.accessibleContest(this.db, userId, id);
    const [submission, vote, submissions] = await Promise.all([
      this.db.submission.findUnique({ where: { contestId_authorId: { contestId: id, authorId: userId } } }),
      this.db.vote.findUnique({ where: { contestId_voterId: { contestId: id, voterId: userId } } }),
      this.submissions(userId, id, 0, 24),
    ]);
    return {
      ...contest,
      phase: phase(contest),
      isAdmin: member.role === 'OWNER',
      mySubmissionId: submission?.id,
      myVoteId: vote?.submissionId,
      submissions,
    };
  }
  async submissions(userId: string, contestId: string, offset: number, limit: number) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 48)
      fail('올바른 목록 범위를 지정해 주세요.');
    const { contest, member } = await this.accessibleContest(this.db, userId, contestId);
    const admin = member.role === 'OWNER';
    const rows = await this.db.submission.findMany({
      where: { contestId, ...(admin ? {} : { hidden: false }) },
      include: submissionInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    });
    return rows.map((row) => this.presentSubmission(row, phase(contest) === 'COMPLETED', admin));
  }
  async createContest(
    userId: string,
    input: { groupId: string; title: string; startsAt: string; submissionEndsAt: string; endsAt: string },
  ) {
    await this.member(this.db, userId, input.groupId, true);
    const dates = contestDates(input.startsAt, input.submissionEndsAt, input.endsAt);
    const title = textValue(input.title, 80, '대회 제목');
    const contest = await this.db.atomic(async (tx) => {
      const created = await tx.contest.create({ data: { groupId: input.groupId, title, ...dates } });
      await recordEvent(tx, `contest:${created.id}`, 'contest_created', userId, {
        groupId: input.groupId,
        contestId: created.id,
      });
      return created;
    });
    return this.contest(userId, contest.id);
  }
  async requestUploadUrl(userId: string, contestId: string) {
    const { contest } = await this.accessibleContest(this.db, userId, contestId);
    if (phase(contest) !== 'SUBMISSION') fail('사진 제출 기간이 아닙니다.');
    const pending = await this.db.upload.count({
      where: { userId, contestId, expiresAt: { gt: new Date() }, submission: null },
    });
    if (pending >= 10) fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'RATE_LIMITED');
    const value = token();
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const upload = await this.db.upload.create({
      data: { userId, contestId, tokenHash: hash(value), expiresAt },
    });
    return { id: upload.id, url: `/backend/uploads/${value}`, expiresAt };
  }
  async createSubmission(
    userId: string,
    contestId: string,
    uploadId: string,
    caption: string,
    rightsConfirmed: boolean,
  ) {
    if (!rightsConfirmed) fail('사진 사용 권리와 촬영된 사람의 동의를 확인해 주세요.');
    const validCaption = textValue(caption, 160, '사진 설명');
    const row = await this.db.atomic(async (tx) => {
      const { contest } = await this.accessibleContest(tx, userId, contestId);
      if (phase(contest) !== 'SUBMISSION') fail('사진 제출 기간이 아닙니다.');
      const upload = await tx.upload.findUnique({ where: { id: uploadId } });
      if (
        !upload ||
        upload.userId !== userId ||
        upload.contestId !== contestId ||
        !upload.imageKey ||
        upload.expiresAt < new Date()
      )
        fail('사진 업로드가 완료되지 않았거나 만료되었습니다.');
      const created = await tx.submission.create({
        data: { authorId: userId, contestId, uploadId, caption: validCaption },
        include: submissionInclude,
      });
      await recordEvent(tx, `submission:${created.id}`, 'submission_created', userId, {
        contestId,
        groupId: contest.groupId,
      });
      const previous = await tx.submission.findFirst({
        where: { authorId: userId, contest: { groupId: contest.groupId, endsAt: { lt: contest.startsAt } } },
      });
      if (previous)
        await recordEvent(tx, `return:${contestId}:${userId}`, 'next_contest_joined', userId, {
          contestId,
          groupId: contest.groupId,
        });
      return created;
    });
    return this.presentSubmission(row, false, false);
  }
  async castVote(userId: string, contestId: string, submissionId: string) {
    return this.db.atomic(async (tx) => {
      const { contest } = await this.accessibleContest(tx, userId, contestId);
      if (phase(contest) !== 'VOTING') fail('투표 기간이 아닙니다.');
      const submission = await tx.submission.findUnique({ where: { id: submissionId } });
      if (!submission || submission.contestId !== contestId || submission.hidden)
        fail('투표할 수 없는 사진입니다.');
      if (submission.authorId === userId) fail('자신의 사진에는 투표할 수 없습니다.');
      const vote = await tx.vote.create({ data: { voterId: userId, contestId, submissionId } });
      await recordEvent(tx, `vote:${vote.id}`, 'vote_cast', userId, { contestId, groupId: contest.groupId });
      return vote;
    });
  }
  async results(userId: string, contestId: string) {
    const { contest, member } = await this.accessibleContest(this.db, userId, contestId);
    if (phase(contest) !== 'COMPLETED') fail('대회가 끝난 후 결과를 확인할 수 있습니다.');
    const rows = await this.db.submission.findMany({
      where: { contestId, hidden: false },
      include: submissionInclude,
    });
    await recordEvent(this.db, `result:${contestId}:${userId}`, 'result_viewed', userId, {
      contestId,
      groupId: contest.groupId,
    });
    const max = Math.max(0, ...rows.map((row) => row._count.votes));
    return rows
      .sort((a, b) => b._count.votes - a._count.votes || a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => ({
        submission: this.presentSubmission(row, true, member.role === 'OWNER'),
        voteCount: row._count.votes,
        winner: max > 0 && row._count.votes === max,
      }));
  }
  async report(userId: string, submissionId: string, reason: string) {
    const submission = await this.db.submission.findUnique({ where: { id: submissionId } });
    if (!submission || submission.hidden) fail('사진을 찾을 수 없습니다.', 'NOT_FOUND');
    await this.accessibleContest(this.db, userId, submission.contestId);
    await this.db.report.upsert({
      where: { submissionId_reporterId: { submissionId, reporterId: userId } },
      create: { submissionId, reporterId: userId, reason: textValue(reason, 500, '신고 이유') },
      update: {},
    });
    return true;
  }
  async moderate(userId: string, submissionId: string, remove: boolean) {
    const imageKey = await this.db.atomic(async (tx) => {
      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
        include: { upload: true },
      });
      if (!submission) fail('사진을 찾을 수 없습니다.', 'NOT_FOUND');
      await this.accessibleContest(tx, userId, submission.contestId, true);
      if (remove) {
        await tx.submission.delete({ where: { id: submissionId } });
        await tx.upload.update({ where: { id: submission.uploadId }, data: { expiresAt: new Date() } });
        return submission.upload.imageKey;
      }
      await tx.submission.update({ where: { id: submissionId }, data: { hidden: true } });
      return null;
    });
    if (imageKey) await deletePhoto(imageKey);
    return true;
  }
}
