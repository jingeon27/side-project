'use client';

import { useRouter } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Flag, Pencil, ShieldBan, Trash2 } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@side/design-system';

import { useSession } from '@/features/auth';
import { deleteCommentMutationOptions, updateCommentMutationOptions } from '@/features/comment';
import { postDetailOptions } from '@/features/post';
import type { Comment } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay, useNotify } from '@/shared/ui';
import { BlockUserDialog, ReportDialog } from '@/widgets/moderation';

import { commentFormSchema } from '../model/content.schema';
import { ContentDeleteDialog } from './ContentDeleteDialog';
import { ContentEditDialog } from './ContentEditDialog';

export function CommentActions({ comment }: { comment: Extract<Comment, { isDeleted: false }> }) {
  const { t, locale } = useI18n();
  const { session, requireLogin } = useSession();
  const client = useQueryClient();
  const notify = useNotify();
  const router = useRouter();
  const { id, postId, author } = comment;
  const mine = author.id === session.user?.id;
  const handleEdit = () =>
    openOverlay((control) => (
      <ContentEditDialog
        {...control}
        title={t('댓글 수정')}
        id={id}
        body={comment.body}
        schema={commentFormSchema}
        options={updateCommentMutationOptions(client)}
      />
    ));
  const handleDelete = () =>
    openOverlay((control) => (
      <ContentDeleteDialog
        {...control}
        description={t('댓글을 삭제해도 다른 사람이 남긴 답글은 유지됩니다.')}
        options={deleteCommentMutationOptions(client)}
        variables={{ id, postId }}
      />
    ));
  const handleReport = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    openOverlay((control) => <ReportDialog {...control} targetType="COMMENT" targetId={id} />);
  };
  const handleBlocked = () => {
    notify(t('사용자를 차단했어요. 설정에서 해제할 수 있어요.'));
    const detail = client.getQueryData(postDetailOptions(postId).queryKey);
    if (detail?.post.author.id === author.id) router.replace(appRoutes.feed(locale));
  };
  const handleBlock = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    openOverlay((control) => <BlockUserDialog {...control} author={author} onBlocked={handleBlocked} />);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            type="button"
            className="comment-menu"
            label={t('{name}님의 댓글 메뉴', { name: author.nickname })}
          />
        }
      >
        <EllipsisVertical aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {mine ? (
          <>
            <DropdownMenuItem onClick={handleEdit}>
              <Pencil aria-hidden />
              {t('수정')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger" onClick={handleDelete}>
              <Trash2 aria-hidden />
              {t('삭제')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={handleReport}>
              <Flag aria-hidden />
              {t('신고')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger" onClick={handleBlock}>
              <ShieldBan aria-hidden />
              {t('차단')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
