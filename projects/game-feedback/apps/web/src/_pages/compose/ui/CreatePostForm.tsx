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

import { createPostMutationOptions } from '@/features/post';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';
import type { Category } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { Field, useNotify } from '@/shared/ui';
import { POST_DETAIL_DEFAULTS, PostComposerFields, usePostComposer } from '@/widgets/post-composer';
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
  const categoryId =
    categories.find((category) => category.active && category.slug === 'clash-royale')?.id ?? '';
  const composer = usePostComposer({
    save: create,
    defaultValues: {
      title: '',
      body: '',
      board: initialBoard,
      categoryId,
      coaching: { ...POST_DETAIL_DEFAULTS.coaching, role: initialCoachingRole ?? 'COACH' },
      battle: { mode: initialBattleMode ?? 'DUEL' },
    },
  });
  const board = useWatch({ control: composer.form.control, name: 'board' }) ?? initialBoard;
  const handleSubmit = composer.handleSubmit(async (input, values) => {
    try {
      const result = await create.mutateAsync({
        body: { ...input, categoryId: values.categoryId, board: values.board },
      });
      trackEvent(ANALYTICS_EVENT.PostCreated, {
        board: result.board ?? values.board ?? 'FEEDBACK',
        game: result.category.slug,
      });
      composer.form.reset();
      notify(t('게시글을 등록했어요.'));
      router.replace(
        appRoutes.post(locale, result.id, initialCategoryId ? result.board : undefined, result.category.slug),
      );
    } catch {
      /* Keep the draft and mutation errors. */
    }
  });
  const submitLabel = match(board)
    .with('COACHING', () => t('코칭 등록'))
    .with('FEEDBACK', () => t('피드백 요청 올리기'))
    .with(P.union('FRIEND_SALE', 'FRIENDLY', 'FREE'), () => t('게시글 등록'))
    .exhaustive();
  return (
    <form className="page-form" aria-label={t('글쓰기')} onSubmit={handleSubmit}>
      <div data-form-scroll className="page-form-scroll">
        <div className="form-stack">
          <PostComposerFields composer={composer}>
            <Field label={t('분류')}>
              <Controller
                control={composer.form.control}
                name="board"
                render={({ field }) => (
                  <NativeSelect
                    {...field}
                    onChange={(event) => {
                      const next = BoardKindSchema.parse(event.target.value);
                      field.onChange(next);
                      // 숨겨진 게시판의 세부 입력이 검증을 막지 않게 기본값으로 되돌린다.
                      if (next !== 'COACHING')
                        composer.form.setValue('coaching', POST_DETAIL_DEFAULTS.coaching, {
                          shouldValidate: true,
                        });
                      if (next !== 'FRIEND_SALE')
                        composer.form.setValue('friendSale', POST_DETAIL_DEFAULTS.friendSale, {
                          shouldValidate: true,
                        });
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
          </PostComposerFields>
        </div>
        <div className="compose-support">
          <VerificationPrompt />
        </div>
      </div>
      <FormActions className="px-0" contentClassName="max-w-none">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          type="submit"
          disabled={!categoryId}
          loading={composer.pending}
        >
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
