'use client';

import { useQueryClient } from '@tanstack/react-query';

import { deleteAnswerMutationOptions, updateAnswerMutationOptions } from '@/features/answer';
import { useSession } from '@/features/auth';
import type { Answer } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay } from '@/shared/ui';
import { StartChatLink } from '@/widgets/start-chat';

import { answerFormSchema } from '../model/content.schema';
import { BlockAuthorButton } from './BlockAuthorButton';
import { ContentDeleteDialog } from './ContentDeleteDialog';
import { ContentEditDialog } from './ContentEditDialog';
import { ContentOwnerActions } from './ContentOwnerActions';
import { ReportContentButton } from './ReportContentButton';

export function AnswerActions({ answer }: { answer: Answer }) {
  const { t } = useI18n();
  const { session } = useSession();
  const client = useQueryClient();
  const { id, postId, author } = answer;
  if (author.id !== session.user?.id)
    return (
      <div className="content-actions">
        <StartChatLink source="comment" userId={author.id} nickname={author.nickname} />
        <ReportContentButton targetType="ANSWER" targetId={id} />
        <BlockAuthorButton author={author} postId={postId} />
      </div>
    );
  return (
    <ContentOwnerActions
      onEdit={() =>
        openOverlay((control) => (
          <ContentEditDialog
            {...control}
            title={t('피드백 수정')}
            id={id}
            body={answer.body}
            schema={answerFormSchema}
            options={updateAnswerMutationOptions(client)}
          />
        ))
      }
      onDelete={() =>
        openOverlay((control) => (
          <ContentDeleteDialog
            {...control}
            description={t(
              '삭제한 내용은 복구할 수 없어요. 요청을 삭제하면 연결된 피드백과 댓글도 보이지 않게 됩니다.',
            )}
            options={deleteAnswerMutationOptions(client)}
            variables={{ id, postId }}
          />
        ))
      }
    />
  );
}
