import { randomUUID } from 'node:crypto';

import { afterAll, expect, inject, it } from 'vitest';

import { createDatabaseClient } from '@photo-contest/test-kit';

const db = createDatabaseClient(inject('databaseUrl'));
afterAll(() => db.$disconnect());

async function fixture() {
  const owner = await db.user.create({
    data: { nickname: '제약 소유자', provider: 'testing', providerId: randomUUID() },
  });
  const peer = await db.user.create({
    data: { nickname: '제약 참여자', provider: 'testing', providerId: randomUUID() },
  });
  const groups = await Promise.all(
    Array.from({ length: 2 }, () =>
      db.group.create({
        data: {
          id: randomUUID(),
          name: '제약 그룹',
          inviteHash: randomUUID(),
          inviteToken: randomUUID(),
          members: { create: { userId: owner.id, role: 'OWNER' } },
        },
      }),
    ),
  );
  const [first, second] = groups;
  if (!first || !second) throw new Error('Missing fixture groups');
  const contest = await db.contest.create({
    data: {
      groupId: first.id,
      title: '제약 대회',
      format: 'POST',
      startsAt: new Date('2026-01-01'),
      submissionEndsAt: new Date('2026-01-02'),
      endsAt: new Date('2026-01-03'),
    },
  });
  return { owner, peer, first, second, contest };
}

it('다른 그룹의 대회를 연결하지 못하고 대회 삭제는 게시물의 그룹을 보존해야 한다', async () => {
  const { owner, first, second, contest } = await fixture();
  const base = { authorId: owner.id, title: '링크 글', linkUrl: 'https://example.test' };
  await expect(
    db.post.create({ data: { ...base, groupId: second.id, contestId: contest.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  const post = await db.post.create({ data: { ...base, groupId: first.id, contestId: contest.id } });
  await db.contest.delete({ where: { id: contest.id } });
  expect(await db.post.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({
    groupId: first.id,
    contestId: null,
  });
});

it('다른 그룹·작성자의 업로드를 게시물에 연결하지 못해야 한다', async () => {
  const { owner, peer, first, second } = await fixture();
  const upload = await db.postUpload.create({
    data: {
      tokenHash: randomUUID(),
      userId: owner.id,
      groupId: first.id,
    },
  });
  const base = { title: '파일 글', uploadId: upload.id };
  await expect(
    db.post.create({ data: { ...base, authorId: owner.id, groupId: second.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    db.post.create({ data: { ...base, authorId: peer.id, groupId: first.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  const post = await db.post.create({ data: { ...base, authorId: owner.id, groupId: first.id } });
  await db.group.delete({ where: { id: first.id } });
  expect(await db.post.findUnique({ where: { id: post.id } })).toBeNull();
});

it('두 번째 그룹장·알 수 없는 역할·잘못된 대회 일정과 좋아요 한도를 DB가 거부해야 한다', async () => {
  const { peer, first, contest } = await fixture();
  await expect(
    db.groupMember.create({ data: { groupId: first.id, userId: peer.id, role: 'OWNER' } }),
  ).rejects.toMatchObject({ code: 'P2002' });
  await expect(
    db.groupMember.create({ data: { groupId: first.id, userId: peer.id, role: 'INVALID' } }),
  ).rejects.toThrow(/GroupMember_role_check/);
  await expect(
    db.contest.update({ where: { id: contest.id }, data: { endsAt: contest.startsAt } }),
  ).rejects.toThrow(/Contest_schedule_check/);
  await expect(db.contest.update({ where: { id: contest.id }, data: { likeLimit: 0 } })).rejects.toThrow(
    /Contest_likeLimit_check/,
  );
  await expect(db.contest.update({ where: { id: contest.id }, data: { likeLimit: 101 } })).rejects.toThrow(
    /Contest_likeLimit_check/,
  );
  expect(await db.groupMember.count({ where: { groupId: first.id, role: 'OWNER' } })).toBe(1);
});
