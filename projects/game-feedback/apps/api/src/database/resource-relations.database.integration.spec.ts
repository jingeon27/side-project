import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from './database-url';
import { createPrismaAdapter } from './prisma-adapter';

const schema = `gf_test_resource_fk_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.DATABASE_URL ?? '');
url.searchParams.set('schema', schema);
const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const require = createRequire(import.meta.url);

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    },
  );
  if (result.status !== 0)
    throw new Error(`Resource FK migration failed: ${result.stdout}\n${result.stderr}`);
});
afterAll(async () => {
  if (!/^gf_test_resource_fk_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned resource schema');
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});

async function fixture() {
  const users = await Promise.all(
    Array.from({ length: 3 }, () =>
      db.user.create({
        data: { nickname: '관계 검사', termsVersion: 'test', ageConfirmed: true },
      }),
    ),
  );
  const [author, peer, other] = users;
  if (!author || !peer || !other) throw new Error('Missing fixture users');
  const category = await db.category.create({ data: { slug: randomUUID(), name: '관계 검사' } });
  const posts = await Promise.all(
    Array.from({ length: 2 }, () =>
      db.post.create({
        data: { categoryId: category.id, authorId: author.id, title: '관계 검사', body: '본문' },
      }),
    ),
  );
  const [first, second] = posts;
  if (!first || !second) throw new Error('Missing fixture posts');
  return { author, peer, other, first, second };
}

it('다른 게시물의 답변·댓글을 알림에 연결하지 못하고 올바른 대상 삭제는 알림도 지워야 한다', async () => {
  const { author, peer, first, second } = await fixture();
  const answer = await db.answer.create({ data: { postId: first.id, authorId: peer.id, body: '답변' } });
  const comment = await db.comment.create({ data: { postId: first.id, authorId: peer.id, body: '댓글' } });
  const base = { userId: author.id, type: 'ANSWER' };
  await expect(
    db.notification.create({ data: { ...base, postId: second.id, answerId: answer.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    db.notification.create({ data: { ...base, postId: second.id, commentId: comment.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  const notice = await db.notification.create({ data: { ...base, postId: first.id, answerId: answer.id } });
  await db.answer.delete({ where: { id: answer.id } });
  expect(await db.notification.findUnique({ where: { id: notice.id } })).toBeNull();
});

it('다른 대화의 메시지에 첨부를 연결하지 못하고 메시지 삭제는 첨부도 지워야 한다', async () => {
  const { author, peer, other } = await fixture();
  const first = await db.chatConversation.create({ data: { firstUserId: author.id, secondUserId: peer.id } });
  const second = await db.chatConversation.create({
    data: { firstUserId: author.id, secondUserId: other.id },
  });
  const message = await db.chatMessage.create({
    data: {
      conversationId: first.id,
      senderId: author.id,
      clientMessageId: randomUUID(),
      body: '메시지',
    },
  });
  const base = {
    uploaderId: author.id,
    messageId: message.id,
    name: 'test.txt',
    mimeType: 'text/plain',
    size: 1,
    bytes: Buffer.from('x'),
  };
  await expect(
    db.chatAttachment.create({ data: { ...base, conversationId: second.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  const file = await db.chatAttachment.create({ data: { ...base, conversationId: first.id } });
  await db.chatMessage.delete({ where: { id: message.id } });
  expect(await db.chatAttachment.findUnique({ where: { id: file.id } })).toBeNull();
});
