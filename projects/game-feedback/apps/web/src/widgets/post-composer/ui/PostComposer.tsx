'use client';
import { useI18n } from '@/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import type { TBoardKind } from '@game-feedback/contracts';
import { categoryOptions } from '@/features/category';
import type { Post } from '@/shared/api';
import { Modal, ErrorNotice, LoadingState } from '@/shared/ui';
import { PostComposerForm } from './PostComposerForm';
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
  const categories = useQuery(categoryOptions());
  const isLoading = categories.isPending;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        post ? t(post.board && post.board !== 'FEEDBACK' ? '게시글 수정' : '피드백 요청 수정') : t('글쓰기')
      }
      description={t('분류에 맞는 글을 작성하고 플레이어와 이야기해보세요.')}
    >
      {isLoading ? (
        <LoadingState text={t('글쓰기를 준비하고 있어요')} />
      ) : categories.isError ? (
        <ErrorNotice message={categories.error?.message} />
      ) : (
        <PostComposerForm
          categories={categories.data || []}
          locale={locale}
          post={post}
          board={activeBoard ?? 'FEEDBACK'}
          allowBoardSelection={!post}
          initialCategoryId={categoryId}
          onComplete={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}
