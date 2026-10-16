'use client';
import { Button } from '@side/design-system';
import { useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, ArrowUpRight, Plus, Info } from 'lucide-react';
import { categoryOptions } from '@/features/category';
import { useSession } from '@/features/auth';
import { useCreatePostMutation, useUpdatePostMutation } from '@/features/post';
import { gameAccountListOptions, Deck } from '@/features/game-profile';
import { ConnectProfile } from '@/widgets/game-profile';
import type { Category, GameProfile, Post } from '@/shared/api';
import { openOverlay, Modal, Field, ErrorNotice, LoadingState, useNotify } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { postComposerSchema } from '../model/post-composer.schema';
interface IPostComposerProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  locale: string;
  post?: Post;
}
export function PostComposer({ open, onOpenChange, locale, post }: IPostComposerProps) {
  const { session } = useSession(),
    categories = useQuery(categoryOptions()),
    accounts = useQuery(gameAccountListOptions(session?.user?.id));
  const isLoading = categories.isPending || accounts.isPending;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={post ? '피드백 요청 수정' : '어떤 플레이가 고민인가요?'}
      description="구체적인 고민을 알려주면 더 좋은 피드백을 받을 수 있어요."
    >
      {isLoading ? (
        <LoadingState text="작성할 프로필을 준비하고 있어요" />
      ) : categories.isError || accounts.isError ? (
        <ErrorNotice message={categories.error?.message || accounts.error?.message} />
      ) : (
        <PostComposerForm
          categories={categories.data || []}
          accounts={accounts.data || []}
          locale={locale}
          post={post}
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
  onOpenChange: (value: boolean) => void;
}
function PostComposerForm({ categories, accounts, locale, post, onOpenChange }: IPostComposerFormProps) {
  const router = useRouter(),
    notify = useNotify(),
    create = useCreatePostMutation(),
    update = useUpdatePostMutation();
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: post?.title || '',
      body: post?.body || '',
      categoryId: post?.categoryId || categories[0]?.id || '',
      ...(post?.gameProfile?.playerTag || accounts[0]?.playerTag
        ? { playerTag: post?.gameProfile?.playerTag || accounts[0]?.playerTag }
        : {}),
    },
  });
  const playerTag = useWatch({ control: form.control, name: 'playerTag' }),
    profile = accounts.find((account) => account.playerTag === playerTag);
  const mutationError = create.error || update.error,
    isPending = create.isPending || update.isPending;
  return (
    <form
      className="form-stack"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const result = post
            ? await update.mutateAsync({ id: post.id, body: { title: values.title, body: values.body } })
            : await create.mutateAsync({ body: values });
          onOpenChange(false);
          notify(post ? '요청을 수정했어요.' : '피드백 요청을 올렸어요. 새로운 시선을 기다려보세요!');
          router.push(`/${locale}/posts/${result.id}`);
        } catch {
          /* Mutation errors remain visible and the draft stays in the form. */
        }
      })}
    >
      <Field label="게임">
        {post ? (
          <>
            <input type="hidden" {...form.register('categoryId')} />
            <input className="ds-input" value={post.category.name} readOnly aria-label="선택한 게임" />
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
      <Field label="제목">
        <input
          className="ds-input"
          {...form.register('title')}
          maxLength={120}
          placeholder="예: 호그 2.6 덱, 페카를 만나면 어떻게 운영하나요?"
        />
        <span className="field-error">
          {form.formState.errors.title && '제목을 4~120자로 입력해 주세요.'}
        </span>
      </Field>
      <Field label="플레이와 고민" hint="사용 중인 덱, 어려웠던 상황, 시도해 본 방법을 함께 적어주세요.">
        <textarea
          className="ds-textarea"
          {...form.register('body')}
          rows={7}
          maxLength={10000}
          placeholder="현재 트로피와 주로 사용하는 덱을 알려주세요. 어떤 상황에서 어려움을 겪고 있나요?"
        />
        <span className="field-error">
          {form.formState.errors.body && '내용을 20~10,000자로 입력해 주세요.'}
        </span>
      </Field>
      {!post && (
        <div className="composer-profile">
          <div className="row-between">
            <strong>내 게임 프로필</strong>
            <span className="small muted">요청 시점의 덱을 함께 보관해요</span>
          </div>
          {accounts.length ? (
            <>
              <select className="ds-select" {...form.register('playerTag')}>
                {accounts.map((account) => (
                  <option key={account.playerTag} value={account.playerTag}>
                    {account.name} · {account.playerTag}
                  </option>
                ))}
              </select>
              {profile && <Deck profile={profile} compact />}
            </>
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
                    title="게임 프로필 연결"
                    description="플레이어 태그로 프로필을 조회하고 확인해주세요."
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
              게임 프로필 연결하기
            </Button>
          )}
          <p className="small muted">
            <Info size={13} />
            프로필 없이도 질문을 올릴 수 있어요. 개인정보는 적지 마세요.
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
        {post ? '수정 완료' : '피드백 요청 올리기'}
      </Button>
    </form>
  );
}
