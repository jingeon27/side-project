import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CategoryInputSchema } from '../../admin/categories/category-input.dto';
import { AdminReportListQuerySchema } from '../../admin/reports/report-input.dto';
import { UserBanInputSchema } from '../../admin/users/user-input.dto';
import { ChatMessageInputSchema } from '../../chat/chat-input.dto';
import { GameAccountInputSchema } from '../../game-profiles/game-account-input.dto';
import { PostInputSchema, PostPatchSchema } from '../../posts/post-input.dto';
import { ListQuerySchema } from './list-query.dto';
import { RequestValidationPipe } from './request-validation';

const metadata = { type: 'body' as const };
describe('Zod HTTP requests and generated contract compatibility', () => {
  it('uses route schema metadata and leaves the raw request unchanged during normalization', async () => {
    const input = { slug: 'game', name: '  Game  ' };
    await expect(
      new RequestValidationPipe().transform(input, { type: 'body', schema: CategoryInputSchema }),
    ).resolves.toEqual({ slug: 'game', name: 'Game' });
    expect(input).toEqual({ slug: 'game', name: '  Game  ' });
  });
  it('rejects wrong JSON types, unknown fields and nested invalid prices before a service receives them', async () => {
    const category = new RequestValidationPipe(CategoryInputSchema);
    for (const input of [
      null,
      [],
      { slug: 23, name: 'game' },
      { slug: 'game', name: 'ok', active: true },
      JSON.parse('{"slug":"game","name":"ok","__proto__":{"admin":true}}'),
    ]) {
      await expect(category.transform(input, metadata)).rejects.toMatchObject({
        response: { errorCode: 'VALIDATION_ERROR' },
      });
    }
    const ban = new RequestValidationPipe(UserBanInputSchema);
    await expect(ban.transform({ banned: 'false', reason: 'review' }, metadata)).rejects.toMatchObject({
      response: { errorCode: 'VALIDATION_ERROR' },
    });
    const post = new RequestValidationPipe(PostInputSchema);
    for (const price of ['10000', 0, -1, 1.5, 10000001]) {
      await expect(
        post.transform(
          {
            title: '친추 판매 글',
            body: '내용',
            categoryId: 'game',
            board: 'FRIEND_SALE',
            friendSale: { price },
          },
          metadata,
        ),
      ).rejects.toMatchObject({ response: { errorCode: 'VALIDATION_ERROR' } });
    }
    await expect(new RequestValidationPipe(PostPatchSchema).transform({}, metadata)).rejects.toMatchObject({
      response: { errorCode: 'VALIDATION_ERROR' },
    });
  });
  it('accepts 30-character titles and rejects 31 for both creation and edits', async () => {
    const input = { title: '제'.repeat(30), body: '본문', categoryId: 'game', board: 'FREE' };
    await expect(
      new RequestValidationPipe(PostInputSchema).transform(input, metadata),
    ).resolves.toMatchObject({
      title: input.title,
    });
    await expect(
      new RequestValidationPipe(PostPatchSchema).transform({ title: input.title }, metadata),
    ).resolves.toEqual({ title: input.title });
    for (const [dto, value] of [
      [PostInputSchema, { ...input, title: '제'.repeat(31) }],
      [PostPatchSchema, { title: '제'.repeat(31) }],
    ] as const)
      await expect(new RequestValidationPipe(dto).transform(value, metadata)).rejects.toMatchObject({
        response: { errorCode: 'VALIDATION_ERROR' },
      });
  });
  it('preserves tag normalization, nullable negotiation, attachment rules and query defaults', async () => {
    await expect(
      new RequestValidationPipe(GameAccountInputSchema).transform({ playerTag: ' p0lyq829 ' }, metadata),
    ).resolves.toEqual({ playerTag: '#P0LYQ829' });
    await expect(
      new RequestValidationPipe(PostInputSchema).transform(
        {
          title: ' 😀😀😀😀 ',
          body: ' 내용 ',
          categoryId: 'game',
          board: 'FRIEND_SALE',
          friendSale: { price: null },
        },
        metadata,
      ),
    ).resolves.toMatchObject({ title: '😀😀😀😀', body: '내용', friendSale: { price: null } });
    const chat = new RequestValidationPipe(ChatMessageInputSchema);
    await expect(
      chat.transform(
        { body: '', clientMessageId: crypto.randomUUID(), attachmentIds: ['image-1'] },
        metadata,
      ),
    ).resolves.toMatchObject({ attachmentIds: ['image-1'] });
    for (const attachmentIds of [[], ['image-1', 'image-1']]) {
      await expect(
        chat.transform({ body: '', clientMessageId: crypto.randomUUID(), attachmentIds }, metadata),
      ).rejects.toMatchObject({ response: { errorCode: 'VALIDATION_ERROR' } });
    }
    const query = new RequestValidationPipe(ListQuerySchema);
    await expect(query.transform({ q: ' hog ', utm_source: 'search' }, { type: 'query' })).resolves.toEqual({
      q: 'hog',
      limit: 12,
    });
    await expect(query.transform({ limit: '5' }, { type: 'query' })).resolves.toEqual({ limit: 5 });
    for (const limit of ['0', '1.5', '51', 'abc', ['5', '10']])
      await expect(query.transform({ limit }, { type: 'query' })).rejects.toMatchObject({
        response: { errorCode: 'VALIDATION_ERROR' },
      });
  });
  it('defaults the administrator report queue to open reports and rejects unknown statuses', async () => {
    const reports = new RequestValidationPipe(AdminReportListQuerySchema);
    await expect(reports.transform({}, { type: 'query' })).resolves.toEqual({ status: 'OPEN', limit: 12 });
    await expect(
      reports.transform({ status: 'DISMISSED', limit: '30', cursor: 'next' }, { type: 'query' }),
    ).resolves.toEqual({ status: 'DISMISSED', limit: 30, cursor: 'next' });
    for (const input of [
      { status: 'CLOSED' },
      { status: 'open' },
      { limit: '51' },
      { cursor: 'x'.repeat(201) },
    ])
      await expect(reports.transform(input, { type: 'query' })).rejects.toMatchObject({
        response: { errorCode: 'VALIDATION_ERROR' },
      });
  });
});
