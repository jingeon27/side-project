'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { UpdateProfileInputSchema } from '@game-feedback/contracts';
import type { PublicProfile } from '@/shared/api';
import { Button, Input } from '@side/design-system';
import { useZodForm } from '@/shared/model/form';
import { useI18n } from '@/shared/i18n';
import { updateProfileMutationOptions } from '../model/profile.mutation-options';

export function ProfileLinksEditor({ links }: { links: PublicProfile['links'] }) {
  const { t } = useI18n();
  const form = useZodForm(UpdateProfileInputSchema, { defaultValues: { links: links ?? [] } });
  const fields = useFieldArray({ control: form.control, name: 'links' });
  const mutation = useMutation(updateProfileMutationOptions(useQueryClient()));
  return (
    <form
      aria-label={t('프로필 링크 편집')}
      onSubmit={form.handleSubmit((input) =>
        mutation.mutate(input, { onSuccess: (profile) => form.reset({ links: profile.links ?? [] }) }),
      )}
    >
      <p className="muted small">{t('링크를 최대 5개 공개할 수 있어요. 이름과 주소를 함께 입력해주세요.')}</p>
      {fields.fields.map((field, index) => (
        <fieldset key={field.id} className="profile-link-field">
          <legend>{t('링크 {number}', { number: index + 1 })}</legend>
          <label>
            {t('이름')} <span aria-hidden>*</span>
            <Input required maxLength={40} {...form.register(`links.${index}.label`)} />
          </label>
          <label>
            {t('주소')} <span aria-hidden>*</span>
            <Input
              required
              type="url"
              maxLength={2048}
              placeholder="https://"
              {...form.register(`links.${index}.url`)}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => fields.remove(index)}
          >
            {t('링크 삭제')}
          </Button>
          {form.formState.errors.links?.[index] && (
            <p role="alert">{t('이름과 올바른 HTTP(S) 주소를 입력해주세요.')}</p>
          )}
        </fieldset>
      ))}
      <div className="profile-edit-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={fields.fields.length >= 5 || mutation.isPending}
          onClick={() => fields.append({ label: '', url: '' })}
        >
          {t('링크 추가')}
        </Button>
        <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
          {t('링크 저장')}
        </Button>
      </div>
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && !form.formState.isDirty && <p role="status">{t('프로필 링크를 저장했어요.')}</p>}
    </form>
  );
}
