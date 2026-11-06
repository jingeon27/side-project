'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useWatch } from 'react-hook-form';
import { match, P } from 'ts-pattern';

import { appRoutes } from '@game-feedback/bridge';
import {
  BoardKindSchema,
  type TBattleMode,
  type TBoardKind,
  type TCoachingRole,
} from '@game-feedback/contracts';
import { Button, FormActions, NativeSelect, NativeSelectOption } from '@side/design-system';

import { useSession } from '@/features/auth';
import { createPostMutationOptions } from '@/features/post';
import { uploadPostMediaMutationOptions } from '@/features/post-media';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';
import type { Category } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field, useNotify } from '@/shared/ui';
import {
  focusInvalidPostContent,
  POST_DETAIL_DEFAULTS,
  postComposerSchema,
  PostContentFields,
  postContentInput,
} from '@/widgets/post-composer';
import { VerificationPrompt } from '@/widgets/support';

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
  const { session } = useSession();
  const upload = useMutation(uploadPostMediaMutationOptions(session.user?.id));
  const categoryId =
    categories.find((category) => category.active && category.slug === 'clash-royale')?.id ?? '';
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: '',
      body: '',
      editorValid: true,
      board: initialBoard,
      categoryId,
      coaching: { ...POST_DETAIL_DEFAULTS.coaching, role: initialCoachingRole ?? 'COACH' },
      friendSale: POST_DETAIL_DEFAULTS.friendSale,
      battle: { mode: initialBattleMode ?? 'DUEL' },
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
  }, focusInvalidPostContent);
  const errorMessage = create.error?.message ?? upload.error?.message;
  const submitLabel = match(board)
    .with('COACHING', () => t('코칭 등록'))
    .with('FEEDBACK', () => t('피드백 요청 올리기'))
    .with(P.union('FRIEND_SALE', 'FRIENDLY', 'FREE'), () => t('게시글 등록'))
    .exhaustive();
  return (
    <form className="page-form" aria-label={t('글쓰기')} onSubmit={handleSubmit}>
      <div data-form-scroll className="page-form-scroll">
        <div className="form-stack">
          <Field label={t('분류')}>
            <Controller
              control={form.control}
              name="board"
              render={({ field }) => (
                <NativeSelect
                  {...field}
                  onChange={(event) => {
                    const next = BoardKindSchema.parse(event.target.value);
                    field.onChange(next);
                    // 숨겨진 게시판의 세부 입력이 검증을 막지 않게 기본값으로 되돌린다.
                    if (next !== 'COACHING')
                      form.setValue('coaching', POST_DETAIL_DEFAULTS.coaching, { shouldValidate: true });
                    if (next !== 'FRIEND_SALE')
                      form.setValue('friendSale', POST_DETAIL_DEFAULTS.friendSale, { shouldValidate: true });
                  }}
                >
                  <NativeSelectOption value="FEEDBACK">{t('피드백')}</NativeSelectOption>
                  <NativeSelectOption value="FRIEND_SALE">{t('친추판매')}</NativeSelectOption>
                  <NativeSelectOption value="FRIENDLY">{t('전투 모집')}</NativeSelectOption>
                  <NativeSelectOption value="COACHING">{t('게임코치')}</NativeSelectOption>
                  <NativeSelectOption value="FREE">{t('자유게시판')}</NativeSelectOption>
                </NativeSelect>
              )}
            />
          </Field>
          <PostContentFields form={form} disabled={pending} onUploadMedia={upload.mutateAsync} />
          <ErrorNotice message={errorMessage && t(errorMessage)} />
        </div>
        <div className="compose-support">
          <VerificationPrompt />
        </div>
      </div>
      <FormActions className="px-0" contentClassName="max-w-none">
        <Button variant="accent" size="lg" fullWidth type="submit" disabled={!categoryId} loading={pending}>
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
