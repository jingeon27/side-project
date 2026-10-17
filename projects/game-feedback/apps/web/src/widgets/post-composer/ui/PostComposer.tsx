'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { useCallback, type ChangeEvent } from 'react';
import { useWatch } from 'react-hook-form';
import type { TRichTextDocument, TBoardKind } from '@game-feedback/contracts';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, ArrowUpRight, Plus, Info } from 'lucide-react';
import { coachingRoles } from '@/features/coaching';
import { gameBoards } from '@/features/board';
import { categoryOptions } from '@/features/category';
import { useSession } from '@/features/auth';
import { useCreatePostMutation, useUpdatePostMutation } from '@/features/post';
import { gameAccountListOptions } from '@/features/game-profile';
import { ConnectProfile } from '@/widgets/game-profile';
import type { Category, GameProfile, Post } from '@/shared/api';
import {
  openOverlay,
  Modal,
  Field,
  ErrorNotice,
  LoadingState,
  useNotify,
  RichTextEditor,
  ServiceErrorBoundary,
} from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { postComposerSchema } from '../model/post-composer.schema';
import { appRoutes } from '@game-feedback/bridge';
interface IPostComposerProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  locale: string;
  post?: Post;
  board?: TBoardKind;
  categoryId?: string;
}
export function PostComposer({ open, onOpenChange, locale, post, board, categoryId }: IPostComposerProps) {
  const { t } = useI18n();
  const activeBoard = post?.board ?? board;
  const { session } = useSession(),
    categories = useQuery(categoryOptions()),
    accounts = useQuery(gameAccountListOptions(session?.user?.id));
  const isLoading = categories.isPending || accounts.isPending;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        post
          ? t(post.board && post.board !== 'FEEDBACK' ? '게시글 수정' : '피드백 요청 수정')
          : t(board === 'COACHING' ? '코칭 등록' : '글쓰기')
      }
      description={t(
        activeBoard === 'FEEDBACK'
          ? '구체적인 고민을 알려주면 더 좋은 피드백을 받을 수 있어요.'
          : '게시판에 맞는 글을 작성하고 플레이어와 이야기해보세요.',
      )}
    >
      {isLoading ? (
        <LoadingState text={t('작성할 프로필을 준비하고 있어요')} />
      ) : categories.isError || accounts.isError ? (
        <ErrorNotice message={categories.error?.message || accounts.error?.message} />
      ) : (
        <PostComposerForm
          categories={categories.data || []}
          accounts={accounts.data || []}
          locale={locale}
          post={post}
          board={activeBoard ?? 'FEEDBACK'}
          allowBoardSelection={!post && !board}
          initialCategoryId={categoryId}
          onOpenChange={onOpenChange}
        />
      )}
    </Modal>
  );
}
interface IPostComposerFormProps {
  categories: Category[];
  accounts: GameProfile[];
  locale: string;
  post?: Post;
  board: TBoardKind;
  allowBoardSelection: boolean;
  initialCategoryId?: string;
  onOpenChange: (value: boolean) => void;
}
function PostComposerForm({
  categories,
  accounts,
  locale,
  post,
  board: initialBoard,
  allowBoardSelection,
  initialCategoryId,
  onOpenChange,
}: IPostComposerFormProps) {
  const { t } = useI18n();
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
      coaching: post?.coaching ?? { role: 'COACH', hourlyRate: null },
      categoryId: post?.categoryId || initialCategoryId || categories[0]?.id || '',
      ...(post?.gameProfile?.playerTag || accounts[0]?.playerTag
        ? { playerTag: post?.gameProfile?.playerTag || accounts[0]?.playerTag }
        : {}),
    },
  });
  const board = useWatch({ control: form.control, name: 'board' }) ?? initialBoard;
  const coachingRole = useWatch({ control: form.control, name: 'coaching.role' });
  const categoryId = useWatch({ control: form.control, name: 'categoryId' });
  const isClashRoyale = categories.find((item) => item.id === categoryId)?.slug === 'clash-royale';
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
  const mutationError = create.error || update.error,
    isPending = create.isPending || update.isPending;
  return (
    <form
      className="form-stack"
      onSubmit={form.handleSubmit(async ({ editorValid, coaching, playerTag, ...values }) => {
        if (!editorValid) return;
        const input = {
          ...values,
          ...(board === 'COACHING' ? { coaching } : {}),
          ...(isClashRoyale && playerTag ? { playerTag } : {}),
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
                },
              })
            : await create.mutateAsync({ body: input });
          onOpenChange(false);
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
          router.push(
            appRoutes.post(
              locale,
              result.id,
              allowBoardSelection ? undefined : result.board,
              result.category.slug,
            ),
          );
        } catch {
          /* Mutation errors remain visible and the draft stays in the form. */
        }
      })}
    >
      <Field label={t('게시판')}>
        {allowBoardSelection ? (
          <select
            className="ds-select"
            {...form.register('board', {
              onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                if (event.target.value === 'COACHING') return;
                form.setValue('coaching', { role: 'COACH', hourlyRate: null }, { shouldValidate: true });
              },
            })}
          >
            {gameBoards.map((item) => (
              <option key={item.kind} value={item.kind}>
                {t(item.name)}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="ds-input"
            readOnly
            value={t(gameBoards.find((item) => item.kind === board)?.name ?? '피드백')}
          />
        )}
      </Field>
      <Field label={t('게임')}>
        {post || initialCategoryId ? (
          <>
            <input type="hidden" {...form.register('categoryId')} />
            <input
              className="ds-input"
              value={
                post?.category.name ?? categories.find((item) => item.id === initialCategoryId)?.name ?? ''
              }
              readOnly
              aria-label={t('선택한 게임')}
            />
          </>
        ) : (
          <select className="ds-select" {...form.register('categoryId')}>
            {categories
              .filter((category) => category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field label={t('제목')}>
        <input
          className="ds-input"
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
      {board === 'COACHING' && (
        <>
          <Field label={t('모집 유형')}>
            <select className="ds-select" {...form.register('coaching.role')}>
              {coachingRoles.map((role) => (
                <option key={role.value} value={role.value}>
                  {t(role.label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t(coachingRole === 'STUDENT' ? '시간당 희망 수강료 (원)' : '시간당 수강료 (원)')}>
            <input
              className="ds-input"
              type="number"
              min={1}
              max={10000000}
              step={1}
              placeholder={t('수강료 협의')}
              {...form.register('coaching.hourlyRate', {
                setValueAs: (value: unknown) =>
                  value === '' || value === null || value === undefined ? null : Number(value),
              })}
            />
            <small>{t('비워두면 채팅으로 수강료를 협의해요.')}</small>
            {form.formState.errors.coaching && (
              <span className="field-error">{t('수강료를 1~10,000,000원으로 입력해주세요.')}</span>
            )}
          </Field>
        </>
      )}
      <div className="rich-text-field">
        <span>{t(board === 'FEEDBACK' ? '플레이와 고민' : '내용')}</span>
        <ServiceErrorBoundary title={t('본문 편집기')}>
          <RichTextEditor
            key={board}
            body={body}
            document={document}
            onChange={handleBodyChange}
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
          {form.formState.errors.body && t('내용을 20~10,000자로 입력해 주세요.')}
          {form.formState.errors.editorValid &&
            t('서식이 너무 복잡하거나 지원되지 않아요. 서식을 줄여주세요.')}
        </span>
      </div>
      {!post && isClashRoyale && (
        <div className="composer-profile">
          <div className="row-between">
            <strong>{t('내 게임 프로필')}</strong>
            <span className="small muted">{t('요청 시점의 프로필을 첨부해요')}</span>
          </div>
          {accounts.length ? (
            <select className="ds-select" {...form.register('playerTag')}>
              {accounts.map((account) => (
                <option key={account.playerTag} value={account.playerTag}>
                  {account.name} ({account.playerTag})
                </option>
              ))}
            </select>
          ) : (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="button outline full"
              type="button"
              onClick={() =>
                openOverlay(({ isOpen, close, unmount }) => (
                  <Modal
                    open={isOpen}
                    onOpenChange={(next) => {
                      if (next) return;
                      close();
                      unmount();
                    }}
                    title={t('게임 프로필 연결')}
                    description={t('플레이어 태그로 프로필을 조회하고 확인해주세요.')}
                  >
                    <ConnectProfile
                      onSaved={(saved) => {
                        form.setValue('playerTag', saved.playerTag);
                        close();
                        unmount();
                      }}
                    />
                  </Modal>
                ))
              }
            >
              <Plus size={16} />
              {t('게임 프로필 연결하기')}
            </Button>
          )}
          <p className="small muted">
            <Info size={13} />
            {t('프로필 없이도 질문을 올릴 수 있어요. 개인정보는 적지 마세요.')}
          </p>
        </div>
      )}
      <ErrorNotice message={mutationError?.message} />
      <Button
        variant="primary"
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
