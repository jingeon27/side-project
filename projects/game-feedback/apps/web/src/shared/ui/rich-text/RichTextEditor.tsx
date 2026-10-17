'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { TRichTextDocument } from '@game-feedback/contracts';
import { useI18n } from '@/shared/i18n';
import { QuillController, type IEditorValue } from './quill-session';

interface IRichTextEditorProps {
  body: string;
  document?: TRichTextDocument | null;
  onChange: (value: IEditorValue) => void;
  disabled?: boolean;
  label: string;
  id?: string;
}
export function RichTextEditor({
  body,
  document,
  onChange,
  disabled = false,
  label,
  id,
}: IRichTextEditorProps) {
  const { t } = useI18n();
  const [controller] = useState(
    () =>
      new QuillController({
        body,
        document,
        label,
        id,
        onChange,
        labels: {
          bold: t('굵게'),
          italic: t('기울임'),
          underline: t('밑줄'),
          strike: t('취소선'),
          'header-2': t('제목 2'),
          'header-3': t('제목 3'),
          'list-ordered': t('번호 목록'),
          'list-bullet': t('글머리 목록'),
          blockquote: t('인용'),
          link: t('링크'),
          clean: t('서식 지우기'),
          'link-url': t('링크 주소'),
          'save-link': t('링크 적용'),
          'remove-link': t('링크 제거'),
        },
      }),
  );
  const failure = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const handleAttach = useCallback(
    (element: HTMLDivElement | null) => controller.attach(element),
    [controller],
  );
  useEffect(() => controller.setDisabled(disabled), [controller, disabled]);
  if (failure) throw failure;
  return <div className="rich-text-editor" ref={handleAttach} />;
}
