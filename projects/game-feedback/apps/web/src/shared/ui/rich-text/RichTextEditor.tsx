'use client';

import { lazy, Suspense } from 'react';

import type { IRichTextEditorProps } from './rich-text-editor.types';

const LazyTiptapEditor = lazy(async () => {
  const { TiptapEditor } = await import('./TiptapEditor');
  return { default: TiptapEditor };
});

export function RichTextEditor(props: IRichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="rich-text-editor rich-text-editor-loading" aria-busy="true">
          {props.placeholder}
        </div>
      }
    >
      <LazyTiptapEditor {...props} />
    </Suspense>
  );
}
