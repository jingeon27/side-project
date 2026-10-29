'use client';

import { useId } from 'react';

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';

import { Button, Textarea } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, useNotify, type IOverlayControlProps } from '@/shared/ui';

import type { answerFormSchema, commentFormSchema } from '../model/content.schema';

interface IContentEditDialogProps<TData> extends IOverlayControlProps {
  /** 번역을 마친 제목 */
  title: string;
  id: string;
  body: string;
  /** 본문 길이 제한도 이 계약 스키마에서 읽는다. */
  schema: typeof answerFormSchema | typeof commentFormSchema;
  options: UseMutationOptions<TData, Error, { id: string; body: { body: string } }>;
}
export function ContentEditDialog<TData>({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  id,
  body,
  schema,
  options,
}: IContentEditDialogProps<TData>) {
  const { t } = useI18n();
  const formId = useId();
  const mutation = useMutation(options);
  const notify = useNotify();
  const form = useZodForm(schema, { defaultValues: { body } });
  const { minLength, maxLength } = schema.shape.body;
  const errorMessage = mutation.error?.message || form.formState.errors.body?.message;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      dismissible={!mutation.isPending}
      title={title}
      description={t('나누고 싶은 내용을 다듬어주세요.')}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('취소')}
          </Button>
          <Button variant="primary" size="lg" type="submit" form={formId} loading={mutation.isPending}>
            {t('수정 완료')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await mutation.mutateAsync({ id, body: values });
            onOpenChange(false);
            notify(t('수정했어요.'));
          } catch {
            /* Mutation errors remain visible. */
          }
        })}
      >
        <Textarea
          aria-label={t('수정 내용')}
          {...form.register('body')}
          rows={6}
          minLength={minLength ?? undefined}
          maxLength={maxLength ?? undefined}
          required
        />
        <ErrorNotice message={errorMessage && t(errorMessage)} />
      </form>
    </BottomSheet>
  );
}
