import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommentSchema, PostDetailSchema, PostSchema, SessionSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

const target = process.env.TEST_DATABASE_URL;
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type Agent = ReturnType<typeof supertest.agent>;

describe.skipIf(!target)('comment threads with deployed PostgreSQL migrations', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let schema: string;
  let categoryId: string;
  let postAuthor: { agent: Agent; id: string };
  let commenter: { agent: Agent; id: string };
  let replier: { agent: Agent; id: string };

  async function login(nickname: string) {
    const agent = supertest.agent(app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    const session = SessionSchema.parse(response.body);
    if (!session.user) throw new Error('Expected authenticated fixture');
    return { agent, id: session.user.id };
  }
  async function createPost(agent = postAuthor.agent) {
    const response = await agent
      .post('/api/posts')
      .set('Origin', origin)
      .send({ categoryId, board: 'FREE', title: '댓글 대화 테스트', body: '댓글과 답글을 함께 남겨주세요.' })
      .expect(200);
    return PostSchema.parse(response.body);
  }
  async function comment(agent: Agent, postId: string, body: string, parentId?: string) {
    const response = await agent
      .post(`/api/posts/${postId}/comments`)
      .set('Origin', origin)
      .send({ body, ...(parentId ? { parentId } : {}) })
      .expect(200);
    return CommentSchema.parse(response.body);
  }
  async function detail(agent: Agent, postId: string) {
    return PostDetailSchema.parse((await agent.get(`/api/posts/${postId}`).expect(200)).body);
  }

  beforeAll(async () => {
    const url = new URL(target ?? '');
    schema = `gf_test_comment_replies_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', schema);
    const databaseUrl = url.toString();
    assertDatabaseUrl(databaseUrl, 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );
    if (result.status !== 0)
      throw new Error(`Comment migration deployment failed: ${result.stderr}\n${result.stdout}`);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seed(db, false);
    app = await createApp({ databaseUrl, webOrigin: origin, demoMode: true, rateLimit: false, prisma: db });
    postAuthor = await login('대댓글글작성자');
    commenter = await login('대댓글원댓글작성자');
    replier = await login('대댓글답글작성자');
    const category = await db.category.findFirstOrThrow({ where: { active: true } });
    categoryId = category.id;
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (db) {
      if (!/^gf_test_comment_replies_[a-f0-9]+$/.test(schema)) throw new Error('Unowned comment test schema');
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });

  it('keeps ordinary comments compatible and returns replies with their root IDs', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '원댓글입니다.');
    const reply = await comment(replier.agent, post.id, '답글입니다.', root.id);
    expect(root).toMatchObject({ parentId: null, isDeleted: false, author: { id: commenter.id } });
    expect(reply).toMatchObject({ parentId: root.id, isDeleted: false, author: { id: replier.id } });
    expect((await detail(postAuthor.agent, post.id)).comments.map(({ id }) => id)).toEqual([
      root.id,
      reply.id,
    ]);
  });

  it('notifies the root and post authors once each and skips self notifications', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '질문이 있어요.');
    await db.notification.deleteMany({ where: { postId: post.id } });
    const reply = await comment(replier.agent, post.id, '설명드릴게요.', root.id);
    const recipients = await db.notification.findMany({
      where: { postId: post.id },
      orderBy: { userId: 'asc' },
    });
    expect(recipients.map(({ userId }) => userId).sort()).toEqual([postAuthor.id, commenter.id].sort());
    expect(recipients.every(({ message }) => message.includes('답글'))).toBe(true);
    expect(recipients.every((item) => item.type === 'COMMENT_REPLY' && item.commentId === reply.id)).toBe(
      true,
    );
    const inbox = await commenter.agent.get('/api/notifications').expect(200);
    expect(inbox.body.items.find((item: { commentId: string }) => item.commentId === reply.id)).toMatchObject(
      {
        type: 'COMMENT_REPLY',
        commentId: reply.id,
        readAt: null,
      },
    );
    await db.notification.deleteMany({ where: { postId: post.id } });
    await comment(commenter.agent, post.id, '제가 추가할게요.', root.id);
    expect(await db.notification.count({ where: { postId: post.id } })).toBe(1);
    const ownRoot = await comment(postAuthor.agent, post.id, '작성자 댓글입니다.');
    await db.notification.deleteMany({ where: { postId: post.id } });
    await comment(replier.agent, post.id, '감사합니다.', ownRoot.id);
    expect(await db.notification.count({ where: { postId: post.id, userId: postAuthor.id } })).toBe(1);
  });

  it('keeps reply notification visibility in sync with blocked parents, hidden threads and deleted replies', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '알림 대상 원댓글');
    const reply = await comment(replier.agent, post.id, '알림 대상 답글', root.id);
    const notifications = async (agent: Agent) => {
      const response = await agent.get('/api/notifications').expect(200);
      return response.body.items.filter((item: { postId: string }) => item.postId === post.id);
    };
    expect(await notifications(postAuthor.agent)).toHaveLength(2);
    await postAuthor.agent
      .post('/api/blocks')
      .set('Origin', origin)
      .send({ blockedUserId: commenter.id })
      .expect(200);
    try {
      expect(await notifications(postAuthor.agent)).toEqual([]);
    } finally {
      await postAuthor.agent.delete(`/api/blocks/${commenter.id}`).set('Origin', origin).expect(200);
    }
    await db.comment.update({ where: { id: root.id }, data: { hidden: true } });
    expect(await notifications(postAuthor.agent)).toEqual([]);
    expect(await notifications(commenter.agent)).toEqual([]);
    await db.comment.update({ where: { id: root.id }, data: { hidden: false } });
    expect(await notifications(commenter.agent)).toHaveLength(1);
    await replier.agent.delete(`/api/comments/${reply.id}`).set('Origin', origin).expect(200);
    expect(await notifications(commenter.agent)).toEqual([]);
    expect(await db.notification.count({ where: { commentId: reply.id } })).toBe(0);
  });

  it('rolls back a reply when its notification cannot be stored', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '트랜잭션 확인 원댓글');
    const before = await db.notification.count({ where: { postId: post.id } });
    await db.$executeRawUnsafe(
      `ALTER TABLE "Notification" ADD CONSTRAINT "reject_reply_notification" CHECK ("type" <> 'COMMENT_REPLY') NOT VALID`,
    );
    try {
      await replier.agent
        .post(`/api/posts/${post.id}/comments`)
        .set('Origin', origin)
        .send({ parentId: root.id, body: '저장되지 않아야 하는 답글' })
        .expect(500);
      expect(await db.comment.count({ where: { postId: post.id } })).toBe(1);
      expect(await db.notification.count({ where: { postId: post.id } })).toBe(before);
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "Notification" DROP CONSTRAINT "reject_reply_notification"');
    }
  });

  it('rejects missing and cross-post parents, deeper nesting and parent changes while editing', async () => {
    const post = await createPost();
    const another = await createPost();
    const root = await comment(commenter.agent, post.id, '원댓글');
    const reply = await comment(replier.agent, post.id, '첫 답글', root.id);
    for (const [postId, parentId, status] of [
      [post.id, 'missing-comment', 404],
      [another.id, root.id, 404],
      [post.id, reply.id, 400],
    ] as const)
      await replier.agent
        .post(`/api/posts/${postId}/comments`)
        .set('Origin', origin)
        .send({ body: '잘못된 답글', parentId })
        .expect(status);
    await replier.agent
      .patch(`/api/comments/${reply.id}`)
      .set('Origin', origin)
      .send({ body: '부모 변조', parentId: null })
      .expect(400);
    await commenter.agent
      .patch(`/api/comments/${reply.id}`)
      .set('Origin', origin)
      .send({ body: '다른 사람 수정' })
      .expect(403);
    await commenter.agent.delete(`/api/comments/${reply.id}`).set('Origin', origin).expect(403);
    await replier.agent
      .patch(`/api/comments/${reply.id}`)
      .set('Origin', origin)
      .send({ body: '수정된 답글' })
      .expect(200);
    expect(
      (await detail(postAuthor.agent, post.id)).comments.find(({ id }) => id === reply.id),
    ).toMatchObject({ body: '수정된 답글', parentId: root.id });
  });

  it('enforces the same-post parent foreign key and self-parent check in the database', async () => {
    const post = await createPost();
    const another = await createPost();
    const root = await comment(commenter.agent, post.id, '부모 댓글');
    await expect(
      db.comment.create({
        data: { postId: another.id, parentId: root.id, authorId: replier.id, body: '다른 게시글 참조' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const id = `self-${randomBytes(8).toString('hex')}`;
    await expect(
      db.comment.create({
        data: { id, parentId: id, postId: post.id, authorId: replier.id, body: '자기 참조' },
      }),
    ).rejects.toThrow();
  });

  it('keeps replies below an anonymous tombstone and removes the tombstone with its last reply', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '삭제할 비공개 본문');
    const reply = await comment(replier.agent, post.id, '남아 있어야 하는 답글', root.id);
    await commenter.agent.delete(`/api/comments/${root.id}`).set('Origin', origin).expect(200);
    const comments = (await detail(postAuthor.agent, post.id)).comments;
    expect(comments.find(({ id }) => id === root.id)).toMatchObject({
      isDeleted: true,
      parentId: null,
      body: '',
      author: null,
    });
    expect(comments.find(({ id }) => id === reply.id)?.body).toBe('남아 있어야 하는 답글');
    expect(JSON.stringify(comments)).not.toContain('삭제할 비공개 본문');
    await replier.agent
      .post(`/api/posts/${post.id}/comments`)
      .set('Origin', origin)
      .send({ parentId: root.id, body: '삭제 후 추가' })
      .expect(404);
    await replier.agent.delete(`/api/comments/${reply.id}`).set('Origin', origin).expect(200);
    expect((await detail(postAuthor.agent, post.id)).comments).toEqual([]);
  });

  it('omits hidden roots with every reply and denies reply mutations and reports through a hidden parent', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '숨길 댓글');
    const reply = await comment(replier.agent, post.id, '숨겨질 답글', root.id);
    await db.comment.update({ where: { id: root.id }, data: { hidden: true } });
    expect((await detail(postAuthor.agent, post.id)).comments).toEqual([]);
    await replier.agent
      .post(`/api/posts/${post.id}/comments`)
      .set('Origin', origin)
      .send({ parentId: root.id, body: '숨김 후 추가' })
      .expect(404);
    await replier.agent
      .patch(`/api/comments/${reply.id}`)
      .set('Origin', origin)
      .send({ body: '숨김 후 수정' })
      .expect(404);
    await replier.agent.delete(`/api/comments/${reply.id}`).set('Origin', origin).expect(404);
    await postAuthor.agent
      .post('/api/reports')
      .set('Origin', origin)
      .send({ targetType: 'COMMENT', targetId: reply.id, reason: 'SPAM' })
      .expect(404);
  });

  it('hides active blocked-root threads but keeps anonymous deleted-root replies visible', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '차단할 작성자의 댓글');
    const reply = await comment(replier.agent, post.id, '차단되지 않은 답글', root.id);
    const block = await db.block.create({ data: { userId: replier.id, blockedUserId: commenter.id } });
    try {
      expect((await detail(replier.agent, post.id)).comments).toEqual([]);
      await replier.agent
        .post(`/api/posts/${post.id}/comments`)
        .set('Origin', origin)
        .send({ body: '차단 후 추가', parentId: root.id })
        .expect(404);
      await replier.agent
        .patch(`/api/comments/${reply.id}`)
        .set('Origin', origin)
        .send({ body: '차단 후 수정' })
        .expect(404);
      await replier.agent.delete(`/api/comments/${reply.id}`).set('Origin', origin).expect(404);
      await replier.agent
        .post('/api/reports')
        .set('Origin', origin)
        .send({ targetType: 'COMMENT', targetId: root.id, reason: 'SPAM' })
        .expect(404);
      await commenter.agent.delete(`/api/comments/${root.id}`).set('Origin', origin).expect(200);
      const visible = (await detail(replier.agent, post.id)).comments;
      expect(visible).toHaveLength(2);
      expect(visible[0]).toMatchObject({ id: root.id, author: null, body: '', isDeleted: true });
      expect(visible[1].id).toBe(reply.id);
    } finally {
      await db.block.delete({ where: { id: block.id } });
    }
  });

  it('filters blocked or hidden replies independently and removes empty deleted roots', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '일반 댓글');
    const reply = await comment(replier.agent, post.id, '가릴 답글', root.id);
    const block = await db.block.create({ data: { userId: postAuthor.id, blockedUserId: replier.id } });
    try {
      expect((await detail(postAuthor.agent, post.id)).comments.map(({ id }) => id)).toEqual([root.id]);
      await commenter.agent.delete(`/api/comments/${root.id}`).set('Origin', origin).expect(200);
      expect((await detail(postAuthor.agent, post.id)).comments).toEqual([]);
    } finally {
      await db.block.delete({ where: { id: block.id } });
    }
    await db.comment.update({ where: { id: reply.id }, data: { hidden: true } });
    expect((await detail(commenter.agent, post.id)).comments).toEqual([]);
  });

  it('serializes root deletion against reply creation without leaving visible orphan replies', async () => {
    const post = await createPost();
    const root = await comment(commenter.agent, post.id, '동시에 삭제할 댓글');
    const [deletion, creation] = await Promise.all([
      commenter.agent.delete(`/api/comments/${root.id}`).set('Origin', origin),
      replier.agent
        .post(`/api/posts/${post.id}/comments`)
        .set('Origin', origin)
        .send({ parentId: root.id, body: '동시에 등록할 답글' }),
    ]);
    expect(deletion.status).toBe(200);
    expect([200, 404]).toContain(creation.status);
    const visible = (await detail(postAuthor.agent, post.id)).comments;
    expect(visible).toHaveLength(creation.status === 200 ? 2 : 0);
    if (visible.length) expect(visible[0]).toMatchObject({ id: root.id, author: null, isDeleted: true });
  });

  it('preserves another user’s reply as a root when the comment author withdraws', async () => {
    const withdrawing = await login('댓글탈퇴사용자');
    const post = await createPost();
    const root = await comment(withdrawing.agent, post.id, '탈퇴할 댓글');
    const reply = await comment(replier.agent, post.id, '보존할 다른 사람 답글', root.id);
    await withdrawing.agent.delete('/api/me').set('Origin', origin).expect(200);
    expect((await detail(postAuthor.agent, post.id)).comments).toMatchObject([
      { id: reply.id, parentId: null, isDeleted: false },
    ]);
  });

  it('allows existing post deletion cascades to remove a whole thread during account withdrawal', async () => {
    const withdrawing = await login('게시글탈퇴사용자');
    const post = await createPost(withdrawing.agent);
    const root = await comment(commenter.agent, post.id, '함께 제거되는 원댓글');
    await comment(replier.agent, post.id, '함께 제거되는 답글', root.id);
    await withdrawing.agent.delete('/api/me').set('Origin', origin).expect(200);
    expect(await db.comment.count({ where: { postId: post.id } })).toBe(0);
  });
});
