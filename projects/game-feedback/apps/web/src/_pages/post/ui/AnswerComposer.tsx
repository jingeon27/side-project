'use client';
import { useI18n } from '@/shared/i18n';
import { Button, Textarea } from '@side/design-system';
import { MessageSquare, Send, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useSession } from '@/features/auth';
import { useCreateAnswerMutation } from '@/features/answer';
import { Avatar, ErrorNotice, useNotify } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { answerFormSchema } from '../model/content.schema';
interface IAnswerComposerProps {
  postId: string;
}
export function AnswerComposer({ postId }: IAnswerComposerProps) {
  const { t } = useI18n();
  const { session, login } = useSession(),
    notify = useNotify(),
    mutation = useCreateAnswerMutation(),
    form = useZodForm(answerFormSchema, { defaultValues: { body: '' } });
  return (
    <div className="answer-compose">
      <div className="row-between">
        <h3>
          <MessageSquare size={18} />
          {t('당신의 시선을 나눠주세요')}
        </h3>
        {session?.user && <Avatar src={session.user.avatarUrl} name={session.user.nickname} size="small" />}
      </div>
      {session?.user ? (
        <form
          onSubmit={form.handleSubmit(async (body) => {
            try {
              await mutation.mutateAsync({ postId, body });
              form.reset();
              notify(t('피드백을 전했어요. 나눠주셔서 고마워요!'));
            } catch {
              /* The draft stays in the form and the mutation exposes the error. */
            }
          })}
        >
          <Textarea
            aria-label={t('피드백 내용')}
            {...form.register('body')}
            placeholder={t('어떤 부분을 바꾸면 좋을까요? 구체적인 이유와 함께 알려주세요. (10자 이상)')}
            minLength={10}
            maxLength={10000}
            rows={5}
            required
          />
          <div className="compose-bottom">
            <Button
              variant="primary"
              size="md"
              type="submit"
              className="button primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              {t('피드백 남기기')}
            </Button>
          </div>
          <ErrorNotice message={mutation.error?.message || form.formState.errors.body?.message} />
        </form>
      ) : (
        <div className="login-prompt">
          <p>{t('로그인하고 함께 플레이를 이야기해요.')}</p>
          <Button variant="primary" size="md" type="submit" className="button dark" onClick={login}>
            {t('로그인하고 피드백 남기기')}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
