import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CreateCategoryDto } from '../../admin/categories/category-input.dto';
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
});
