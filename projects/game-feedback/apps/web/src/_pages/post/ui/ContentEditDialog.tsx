'use client';
import { Button } from '@side/design-system';
import { LoaderCircle } from 'lucide-react';
import { useUpdateAnswerMutation } from '@/features/answer';
import { useUpdateCommentMutation } from '@/features/comment';
import { ErrorNotice, Modal, useNotify } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { answerFormSchema, commentFormSchema } from '../model/content.schema';
interface IContentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'ANSWER' | 'COMMENT';
  id: string;
  body: string;
}
export function ContentEditDialog({ open, onOpenChange, type, id, body }: IContentEditDialogProps) {
  const answer = useUpdateAnswerMutation(),
    comment = useUpdateCommentMutation(),
    notify = useNotify(),
    form = useZodForm(type === 'ANSWER' ? answerFormSchema : commentFormSchema, { defaultValues: { body } });
  const isPending = answer.isPending || comment.isPending,
    error = answer.error || comment.error;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!isPending}
      title={type === 'ANSWER' ? '피드백 수정' : '댓글 수정'}
      description="나누고 싶은 내용을 다듬어주세요."
    >
      <form
        className="form-stack"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            if (type === 'ANSWER') await answer.mutateAsync({ id, body: values });
            if (type === 'COMMENT') await comment.mutateAsync({ id, body: values });
            onOpenChange(false);
            notify('수정했어요.');
          } catch {
            /* Mutation errors remain visible. */
          }
        })}
      >
        <textarea
          className="ds-textarea"
          aria-label="수정 내용"
          {...form.register('body')}
          rows={6}
          minLength={type === 'ANSWER' ? 10 : 1}
          maxLength={type === 'ANSWER' ? 10000 : 2000}
          required
        />
        <ErrorNotice message={error?.message || form.formState.errors.body?.message} />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          type="submit"
          className="button primary full"
          disabled={isPending}
        >
          {isPending && <LoaderCircle className="spin" size={16} />}수정 완료
        </Button>
      </form>
    </Modal>
  );
}
