import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CreateCategoryDto } from '../../admin/categories/category-input.dto';
import { AdminReportListQueryDto } from '../../admin/reports/report-input.dto';
import { UserBanDto } from '../../admin/users/user-input.dto';
import { SendMessageDto } from '../../chat/chat-input.dto';
import { GameAccountDto } from '../../game-profiles/game-account-input.dto';
import { CreatePostDto, UpdatePostDto } from '../../posts/post-input.dto';
import { ListQueryDto } from './list-query.dto';
import { RequestValidationPipe } from './request-validation';

const metadata = { type: 'body' as const };
describe('decorated HTTP requests and generated contract compatibility', () => {
  it('rejects wrong JSON types, unknown fields and nested invalid prices before a service receives them', async () => {
    const category = new RequestValidationPipe(CreateCategoryDto);
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
    const ban = new RequestValidationPipe(UserBanDto);
    await expect(ban.transform({ banned: 'false', reason: 'review' }, metadata)).rejects.toMatchObject({
      response: { errorCode: 'VALIDATION_ERROR' },
    });
    const post = new RequestValidationPipe(CreatePostDto);
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
    await expect(new RequestValidationPipe(UpdatePostDto).transform({}, metadata)).rejects.toMatchObject({
      response: { errorCode: 'VALIDATION_ERROR' },
    });
  });
  it('accepts 60-character titles and rejects 61 for both creation and edits', async () => {
    const input = { title: '제'.repeat(60), body: '본문', categoryId: 'game', board: 'FREE' };
    await expect(new RequestValidationPipe(CreatePostDto).transform(input, metadata)).resolves.toMatchObject({
      title: input.title,
    });
    await expect(
      new RequestValidationPipe(UpdatePostDto).transform({ title: input.title }, metadata),
    ).resolves.toEqual({ title: input.title });
    for (const [dto, value] of [
      [CreatePostDto, { ...input, title: '제'.repeat(61) }],
      [UpdatePostDto, { title: '제'.repeat(61) }],
    ] as const)
      await expect(new RequestValidationPipe(dto).transform(value, metadata)).rejects.toMatchObject({
        response: { errorCode: 'VALIDATION_ERROR' },
      });
  });
  it('preserves tag normalization, nullable negotiation, attachment rules and query defaults', async () => {
    await expect(
      new RequestValidationPipe(GameAccountDto).transform({ playerTag: ' p0lyq829 ' }, metadata),
    ).resolves.toEqual({ playerTag: '#P0LYQ829' });
    await expect(
      new RequestValidationPipe(CreatePostDto).transform(
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
    const chat = new RequestValidationPipe(SendMessageDto);
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
    const query = new RequestValidationPipe(ListQueryDto, true);
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
    const reports = new RequestValidationPipe(AdminReportListQueryDto, true);
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
