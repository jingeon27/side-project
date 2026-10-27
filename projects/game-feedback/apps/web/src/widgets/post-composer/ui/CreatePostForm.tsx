'use client';

import type { ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { appRoutes } from '@game-feedback/bridge';
import type { TBattleMode, TBoardKind, TCoachingRole } from '@game-feedback/contracts';
import { Button, Input, NativeSelect, NativeSelectOption } from '@side/design-system';

import { createPostMutationOptions } from '@/features/post';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';
import type { Category } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field, useNotify } from '@/shared/ui';

import { postComposerSchema } from '../model/post-composer.schema';
import { postContentInput } from '../model/post-content-input';
import { usePostMediaUpload } from '../model/use-post-media-upload';
import { PostContentFields } from './PostContentFields';

interface ICreatePostFormProps {
  categories: Category[];
  locale: string;
  board: TBoardKind;
  initialCategoryId?: string;
  initialBattleMode?: TBattleMode;
  initialCoachingRole?: TCoachingRole;
}
export function CreatePostForm({
  categories,
  locale,
  board: initialBoard,
  initialCategoryId,
  initialBattleMode,
  initialCoachingRole,
}: ICreatePostFormProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const router = useRouter();
  const notify = useNotify();
  const create = useMutation(createPostMutationOptions(client));
  const { upload, handleUpload } = usePostMediaUpload();
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: '',
      body: '',
      editorValid: true,
      board: initialBoard,
      coaching: { role: initialCoachingRole ?? 'COACH', pricing: { type: 'HOURLY', amount: null } },
      friendSale: { price: null },
      battle: { mode: initialBattleMode ?? 'DUEL' },
      categoryId: initialCategoryId ?? categories[0]?.id ?? '',
    },
  });
  const board = useWatch({ control: form.control, name: 'board' }) ?? initialBoard;
  const pending = create.isPending || upload.isPending;
  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await create.mutateAsync({
        body: { ...postContentInput(values), categoryId: values.categoryId, board: values.board },
      });
      trackEvent(ANALYTICS_EVENT.PostCreated, {
        board: result.board ?? values.board ?? 'FEEDBACK',
        game: result.category.slug,
      });
      form.reset();
      notify(t('게시글을 등록했어요.'));
      router.replace(
        appRoutes.post(locale, result.id, initialCategoryId ? result.board : undefined, result.category.slug),
      );
    } catch {
      /* Keep the draft and mutation errors. */
    }
  });
  const errorMessage = create.error?.message ?? upload.error?.message;
  return (
    <form className="form-stack" aria-label={t('글쓰기')} onSubmit={handleSubmit}>
      <Field label={t('분류')}>
        <NativeSelect
          {...form.register('board', {
            onChange: (event: ChangeEvent<HTMLSelectElement>) => {
              if (event.target.value !== 'COACHING')
                form.setValue(
                  'coaching',
                  { role: 'COACH', pricing: { type: 'HOURLY', amount: null } },
                  { shouldValidate: true },
                );
              if (event.target.value !== 'FRIEND_SALE')
                form.setValue('friendSale', { price: null }, { shouldValidate: true });
            },
          })}
        >
          <NativeSelectOption value="FEEDBACK">{t('피드백')}</NativeSelectOption>
          <NativeSelectOption value="FRIEND_SALE">{t('친추판매')}</NativeSelectOption>
          <NativeSelectOption value="FRIENDLY">{t('전투 모집')}</NativeSelectOption>
          <NativeSelectOption value="COACHING">{t('게임코치')}</NativeSelectOption>
          <NativeSelectOption value="FREE">{t('자유게시판')}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label={t('게임')}>
        {initialCategoryId ? (
          <>
            <input type="hidden" {...form.register('categoryId')} />
            <Input
              readOnly
              aria-label={t('선택한 게임')}
              value={categories.find((item) => item.id === initialCategoryId)?.name ?? ''}
            />
          </>
        ) : (
          <NativeSelect {...form.register('categoryId')}>
            {categories
              .filter((category) => category.active)
              .map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {category.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        )}
      </Field>
      <PostContentFields form={form} disabled={pending} onUploadMedia={handleUpload} />
      <ErrorNotice message={errorMessage && t(errorMessage)} />
      <Button variant="accent" size="lg" fullWidth type="submit" disabled={pending || !categories.length}>
        {pending ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
        {t(board === 'COACHING' ? '코칭 등록' : board === 'FEEDBACK' ? '피드백 요청 올리기' : '게시글 등록')}
      </Button>
    </form>
  );
}
