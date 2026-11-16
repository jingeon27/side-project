'use client';

import type { Editor } from '@tiptap/core';
import { z } from 'zod';

import { RichTextAttributesSchema } from '@game-feedback/contracts';
import { Button, Dialog, Input } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';

import { Field } from '../Field';
import type { IOverlayControlProps } from '../open-overlay';

const linkSchema = z.object({ href: RichTextAttributesSchema.shape.link.unwrap() });

export function TiptapLinkDialog({ editor, ...control }: IOverlayControlProps & { editor: Editor }) {
  const { t } = useI18n();
  const form = useZodForm(linkSchema, {
    defaultValues: { href: String(editor.getAttributes('link').href ?? '') },
  });
  return (
    <Dialog {...control} title={t('링크 주소')} closeLabel={t('닫기')}>
      <form
        className="rich-text-link-form"
        onSubmit={(event) => {
          event.stopPropagation();
          void form.handleSubmit(({ href }) => {
            if (editor.isDestroyed) return;
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            control.onOpenChange(false);
          })(event);
        }}
      >
        <Field label={t('링크 주소')} error={form.formState.errors.href?.message}>
          <Input
            {...form.register('href')}
            type="url"
            inputMode="url"
            placeholder="https://"
            pattern="[Hh][Tt][Tt][Pp][Ss]?://.+"
            maxLength={2048}
            required
          />
        </Field>
        <div className="rich-text-link-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!editor.isDestroyed) editor.chain().focus().extendMarkRange('link').unsetLink().run();
              control.onOpenChange(false);
            }}
          >
            {t('링크 제거')}
          </Button>
          <Button type="submit">{t('링크 적용')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
