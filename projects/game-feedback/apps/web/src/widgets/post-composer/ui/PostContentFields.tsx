'use client';

import { useCallback, useId } from 'react';

import { useWatch } from 'react-hook-form';
import { match, P } from 'ts-pattern';

import { POST_TITLE_MAX_LENGTH, type TRichTextDocument } from '@game-feedback/contracts';
import { Input } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { Field, RichTextEditor, ServiceErrorBoundary } from '@/shared/ui';

import { postComposerCopy } from '../model/post-composer-copy';
import type { TPostComposerForm } from '../model/post-composer.schema';
import { BattleFields } from './BattleFields';
import { CoachingFields } from './CoachingFields';

interface IPostContentFieldsProps {
  form: TPostComposerForm;
  disabled: boolean;
  onUploadMedia: Parameters<typeof RichTextEditor>[0]['onUploadMedia'];
}
export function PostContentFields({ form, disabled, onUploadMedia }: IPostContentFieldsProps) {
  const { t } = useI18n();
  const board = useWatch({ control: form.control, name: 'board' }) ?? 'FEEDBACK';
  const role = useWatch({ control: form.control, name: 'coaching.role' }) ?? 'COACH';
  const mode = useWatch({ control: form.control, name: 'battle.mode' }) ?? 'DUEL';
  const copy = postComposerCopy(board, role, mode);
  const body = useWatch({ control: form.control, name: 'body' });
  const title = useWatch({ control: form.control, name: 'title' });
  const document = useWatch({ control: form.control, name: 'document' });
  const bodyId = useId();
  const bodyLabelId = `${bodyId}-label`;
  const bodyHintId = `${bodyId}-hint`;
  const bodyErrorId = `${bodyId}-error`;
  const bodyError = match(form.formState.errors)
    .with({ body: { type: 'too_big' } }, () => t('내용을 조금 줄여주세요.'))
    .with({ body: P.nonNullable }, () => t('내용을 입력해주세요.'))
    .with({ editorValid: P.nonNullable }, () =>
      t('서식이 너무 복잡하거나 지원되지 않아요. 서식을 줄여주세요.'),
    )
    .otherwise(() => undefined);
  const bodyHint = match(board)
    .with('FEEDBACK', () => t('사용 중인 덱, 어려웠던 상황, 시도해 본 방법을 함께 적어주세요.'))
    .with('COACHING', () => t('코칭 분야, 대상, 진행 방식, 시간과 비용을 구체적으로 적어주세요.'))
    .with('FREE', () => t('게임 이야기나 나누고 싶은 내용을 자유롭게 적어주세요.'))
    .with(P.union('FRIEND_SALE', 'FRIENDLY'), () => t('거래 조건이나 모집 내용을 구체적으로 적어주세요.'))
    .exhaustive();
  const { setValue } = form;
  const handleBodyChange = useCallback(
    (value: { body: string; document: TRichTextDocument | null; valid: boolean }) => {
      setValue('body', value.body, { shouldDirty: true, shouldValidate: true });
      setValue('document', value.document, { shouldDirty: true });
      setValue('editorValid', value.valid, { shouldValidate: true });
    },
    [setValue],
  );
  return (
    <>
      <Field
        label={t('제목')}
        labelSuffix={
          <span className="ml-auto text-caption text-muted tabular-nums" aria-hidden="true">
            {title?.length ?? 0}/{POST_TITLE_MAX_LENGTH}
          </span>
        }
        hint={t('제목은 4~30자로 입력해주세요.')}
        error={form.formState.errors.title && t('제목을 4~30자로 입력해 주세요.')}
      >
        <Input {...form.register('title')} maxLength={POST_TITLE_MAX_LENGTH} placeholder={t(copy.title)} />
      </Field>
      {board === 'FRIEND_SALE' && (
        <Field label={t('판매 금액 (원)')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={10000000}
            step={1}
            placeholder={t('예: 15000')}
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
      {board === 'FRIENDLY' && <BattleFields form={form} />}
      <div className="rich-text-field">
        <span id={bodyLabelId}>{t(board === 'FEEDBACK' ? '플레이와 고민' : '내용')}</span>
        <ServiceErrorBoundary title={t('본문 편집기')}>
          <RichTextEditor
            key={board}
            id={bodyId}
            labelledBy={bodyLabelId}
            describedBy={[bodyHintId, bodyError ? bodyErrorId : undefined].filter(Boolean).join(' ')}
            invalid={Boolean(bodyError)}
            body={body}
            document={document}
            onChange={handleBodyChange}
            onUploadMedia={onUploadMedia}
            disabled={disabled}
            label={t(board === 'FEEDBACK' ? '플레이와 고민' : '내용')}
            placeholder={t(copy.body)}
          />
        </ServiceErrorBoundary>
        <small id={bodyHintId}>{bodyHint}</small>
        {bodyError && (
          <span id={bodyErrorId} className="field-error" role="alert">
            {bodyError}
          </span>
        )}
      </div>
    </>
  );
}
