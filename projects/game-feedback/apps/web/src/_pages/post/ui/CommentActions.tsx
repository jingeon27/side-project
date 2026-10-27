'use client';

import { useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { deleteCommentMutationOptions, updateCommentMutationOptions } from '@/features/comment';
import type { Comment } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay } from '@/shared/ui';
import { StartChatLink } from '@/widgets/start-chat';

import { commentFormSchema } from '../model/content.schema';
import { BlockAuthorButton } from './BlockAuthorButton';
import { ContentDeleteDialog } from './ContentDeleteDialog';
import { ContentEditDialog } from './ContentEditDialog';
import { ContentOwnerActions } from './ContentOwnerActions';
import { ReportContentButton } from './ReportContentButton';

/** 삭제된 댓글에는 작성자와 본문이 없어 동작을 보이지 않는다. */
export function CommentActions({ comment }: { comment: Extract<Comment, { isDeleted: false }> }) {
  const { t } = useI18n();
  const { session } = useSession();
  const client = useQueryClient();
  const { id, postId, author } = comment;
  if (author.id !== session.user?.id)
    return (
      <div className="content-actions">
        <StartChatLink source="comment" userId={author.id} nickname={author.nickname} />
        <ReportContentButton targetType="COMMENT" targetId={id} />
        <BlockAuthorButton author={author} postId={postId} />
      </div>
    );
  return (
    <ContentOwnerActions
      onEdit={() =>
        openOverlay((control) => (
          <ContentEditDialog
            {...control}
            title={t('댓글 수정')}
            id={id}
            body={comment.body}
            schema={commentFormSchema}
            options={updateCommentMutationOptions(client)}
          />
        ))
      }
      onDelete={() =>
        openOverlay((control) => (
          <ContentDeleteDialog
            {...control}
            description={t('댓글을 삭제해도 다른 사람이 남긴 답글은 유지됩니다.')}
            options={deleteCommentMutationOptions(client)}
            variables={{ id, postId }}
          />
        ))
      }
    />
  );
}
