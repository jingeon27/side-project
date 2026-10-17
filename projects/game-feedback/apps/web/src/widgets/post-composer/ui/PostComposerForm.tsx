'use client';
import { useI18n } from '@/shared/i18n';
import { Button, Input, NativeSelect, NativeSelectOption } from '@side/design-system';
import { useCallback, type ChangeEvent } from 'react';
import { useWatch } from 'react-hook-form';
import type { TRichTextDocument, TBoardKind } from '@game-feedback/contracts';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { uploadPostMediaMutationOptions } from '@/features/post-media';
import { LoaderCircle, ArrowUpRight } from 'lucide-react';
import { gameBoards } from '@/features/board';
import { useSession } from '@/features/auth';
import { useCreatePostMutation, useUpdatePostMutation } from '@/features/post';
import type { Category, Post } from '@/shared/api';
import { Field, ErrorNotice, useNotify, RichTextEditor, ServiceErrorBoundary } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { postComposerSchema } from '../model/post-composer.schema';
import { CoachingFields } from './CoachingFields';
import { appRoutes } from '@game-feedback/bridge';

interface IPostComposerFormProps {
  categories: Category[];
  locale: string;
  post?: Post;
  board: TBoardKind;
  allowBoardSelection: boolean;
  initialCategoryId?: string;
  onComplete?: () => void;
}
export function PostComposerForm({
  categories,
  locale,
  post,
  board: initialBoard,
  allowBoardSelection,
  initialCategoryId,
  onComplete,
}: IPostComposerFormProps) {
  const { t } = useI18n();
  const { session } = useSession();
  const upload = useMutation(uploadPostMediaMutationOptions(session?.user?.id));
  const { mutateAsync: uploadMedia } = upload;
  const handleUploadMedia = useCallback((file: File) => uploadMedia(file), [uploadMedia]);
  const router = useRouter(),
    notify = useNotify(),
    create = useCreatePostMutation(),
    update = useUpdatePostMutation();
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: post?.title || '',
      body: post?.body || '',
      document: post?.document ?? undefined,
      editorValid: true,
      board: post?.board ?? initialBoard,
      coaching: post?.coaching ?? { role: 'COACH', pricing: { type: 'HOURLY', amount: null } },
      friendSale: post?.friendSale ?? { price: null },
      categoryId: post?.categoryId || initialCategoryId || categories[0]?.id || '',
    },
  });
  const board = useWatch({ control: form.control, name: 'board' }) ?? initialBoard;
  const body = useWatch({ control: form.control, name: 'body' });
  const document = useWatch({ control: form.control, name: 'document' });
  const { setValue } = form;
  const handleBodyChange = useCallback(
    (value: { body: string; document: TRichTextDocument | null; valid: boolean }) => {
      setValue('body', value.body, { shouldDirty: true, shouldValidate: true });
      setValue('document', value.document, { shouldDirty: true });
      setValue('editorValid', value.valid, { shouldValidate: true });
    },
    [setValue],
  );
  const mutationError = create.error || update.error || upload.error,
    isPending = create.isPending || update.isPending || upload.isPending;
  return (
    <form
      className="form-stack"
      aria-label={t(post ? '게시글 수정' : '글쓰기')}
      onSubmit={form.handleSubmit(async ({ editorValid, coaching, friendSale, ...values }) => {
        if (!editorValid) return;
        const input = {
          ...values,
          ...(board === 'COACHING' ? { coaching } : {}),
          ...(board === 'FRIEND_SALE' ? { friendSale } : {}),
        };
        try {
          const result = post
            ? await update.mutateAsync({
                id: post.id,
                body: {
                  title: values.title,
                  body: values.body,
                  document: values.document ?? null,
                  ...(board === 'COACHING' ? { coaching } : {}),
                  ...(board === 'FRIEND_SALE' ? { friendSale } : {}),
                },
              })
            : await create.mutateAsync({ body: input });
          onComplete?.();
          notify(
            post
              ? t('요청을 수정했어요.')
              : t(
                  board === 'FEEDBACK'
                    ? '피드백 요청을 올렸어요. 새로운 시선을 기다려보세요!'
                    : '게시글을 등록했어요.',
                ),
          );
          if (post) {
            router.refresh();
            return;
          }
          router.replace(
            appRoutes.post(
              locale,
              result.id,
              initialCategoryId ? result.board : undefined,
              result.category.slug,
            ),
          );
        } catch {
          /* Mutation errors remain visible and the draft stays in the form. */
        }
      })}
    >
      <Field label={t('분류')}>
        {allowBoardSelection ? (
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
            {gameBoards.map((item) => (
              <NativeSelectOption key={item.kind} value={item.kind}>
                {t(item.name)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <Input readOnly value={t(gameBoards.find((item) => item.kind === board)?.name ?? '피드백')} />
        )}
      </Field>
      <Field label={t('게임')}>
        {post || initialCategoryId ? (
          <>
            <input type="hidden" {...form.register('categoryId')} />
            <Input
              value={
                post?.category.name ?? categories.find((item) => item.id === initialCategoryId)?.name ?? ''
              }
              readOnly
              aria-label={t('선택한 게임')}
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
      <Field label={t('제목')}>
        <Input
          {...form.register('title')}
          maxLength={120}
          placeholder={t(
            board === 'FEEDBACK'
              ? '예: 호그 2.6 덱, 페카를 만나면 어떻게 운영하나요?'
              : '제목을 입력해주세요.',
          )}
        />
        <span className="field-error">
          {form.formState.errors.title && t('제목을 4~120자로 입력해 주세요.')}
        </span>
      </Field>
      {board === 'FRIEND_SALE' && (
        <Field label={t('판매 금액 (원)')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={10000000}
            step={1}
            placeholder={t('가격 협의')}
            {...form.register('friendSale.price', {
              setValueAs: (value: unknown) =>
                value === '' || value === null || value === undefined ? null : Number(value),
            })}
          />
          <small>{t('비워두면 채팅으로 가격을 협의해요.')}</small>
          {form.formState.errors.friendSale && (
            <span className="field-error">{t('판매 금액을 1~10,000,000원으로 입력해주세요.')}</span>
          )}
        </Field>
      )}
      {board === 'COACHING' && <CoachingFields form={form} />}
      <div className="rich-text-field">
        <span>{t(board === 'FEEDBACK' ? '플레이와 고민' : '내용')}</span>
        <ServiceErrorBoundary title={t('본문 편집기')}>
          <RichTextEditor
            key={board}
            body={body}
            document={document}
            onChange={handleBodyChange}
            onUploadMedia={handleUploadMedia}
            disabled={isPending}
            label={t(board === 'FEEDBACK' ? '플레이와 고민' : '내용')}
          />
        </ServiceErrorBoundary>
        <small>
          {t(
            board === 'FEEDBACK'
              ? '사용 중인 덱, 어려웠던 상황, 시도해 본 방법을 함께 적어주세요.'
              : board === 'COACHING'
                ? '코칭 분야, 대상, 진행 방식, 시간과 비용을 구체적으로 적어주세요.'
                : board === 'FREE'
                  ? '게임 이야기나 나누고 싶은 내용을 자유롭게 적어주세요.'
                  : '거래 조건이나 모집 내용을 구체적으로 적어주세요.',
          )}
        </small>
        <span className="field-error">
          {form.formState.errors.body && t('내용을 입력해주세요. 최대 10,000자까지 작성할 수 있어요.')}
          {form.formState.errors.editorValid &&
            t('서식이 너무 복잡하거나 지원되지 않아요. 서식을 줄여주세요.')}
        </span>
      </div>
      <ErrorNotice message={mutationError?.message} />
      <Button
        variant="accent"
        size="lg"
        fullWidth
        type="submit"
        className="button primary full"
        disabled={isPending || !categories.length}
      >
        {isPending ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
        {post
          ? t('수정 완료')
          : t(
              board === 'COACHING'
                ? '코칭 등록'
                : board === 'FEEDBACK'
                  ? '피드백 요청 올리기'
                  : '게시글 등록',
            )}
      </Button>
    </form>
  );
}
