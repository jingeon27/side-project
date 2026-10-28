'use client';

import { useId } from 'react';

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

import { Button } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { BottomSheet, ErrorNotice, useNotify, type IOverlayControlProps } from '@/shared/ui';

interface IContentDeleteDialogProps<TData, TVariables> extends IOverlayControlProps {
  /** 번역을 마친 삭제 안내 */
  description: string;
  /** 삭제할 콘텐츠의 mutation options. 대화상자 안에서 조립해 닫힐 때까지 대기·오류를 보인다. */
  options: UseMutationOptions<TData, Error, TVariables>;
  variables: TVariables;
  onDeleted?: () => void;
}
export function ContentDeleteDialog<TData, TVariables>({
  open,
  onOpenChange,
  onOpenChangeComplete,
  description,
  options,
  variables,
  onDeleted,
}: IContentDeleteDialogProps<TData, TVariables>) {
  const { t } = useI18n();
  const formId = useId();
  const mutation = useMutation(options);
  const notify = useNotify();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      dismissible={!mutation.isPending}
      title={t('정말 삭제할까요?')}
      description={description}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('돌아가기')}
          </Button>
          <Button variant="danger" size="lg" type="submit" form={formId} disabled={mutation.isPending}>
            {mutation.isPending && <LoaderCircle className="spin" size={16} />}
            {t('삭제하기')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await mutation.mutateAsync(variables);
            onOpenChange(false);
            notify(t('삭제했어요.'));
            onDeleted?.();
          } catch {
            /* Mutation errors remain visible. */
          }
        }}
      >
        <ErrorNotice message={mutation.error && t(mutation.error.message)} />
      </form>
    </BottomSheet>
  );
}
