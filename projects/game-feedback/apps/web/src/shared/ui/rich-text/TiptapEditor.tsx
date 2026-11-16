'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Editor, EditorOptions } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';

import { PostMediaUrlSchema, RichTextDocumentSchema, richTextToPlainText } from '@game-feedback/contracts';

import { mediaAccept } from '@/shared/lib/media-types';

import type { IRichTextEditorProps } from './rich-text-editor.types';
import { richTextToTiptap, tiptapToRichText } from './tiptap-document';
import { createRichTextExtensions } from './tiptap-extensions';
import { TiptapToolbar } from './TiptapToolbar';

function showEmptyState(editor: Editor) {
  editor.view.dom.setAttribute('data-empty', String(editor.isEmpty));
}

export function TiptapEditor({
  body,
  document,
  onChange,
  disabled = false,
  label,
  placeholder = '',
  id,
  labelledBy,
  describedBy,
  invalid = false,
  onUploadMedia,
}: IRichTextEditorProps) {
  // This is the editor's initial configuration, not a second live form draft.
  // Subsequent RHF changes must never reset the selection or an IME composition.
  const [initial] = useState(() => ({
    content: richTextToTiptap(document, body),
    extensions: createRichTextExtensions(),
  }));
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const viewportFrame = useRef<number | null>(null);
  const handleImageInputRef = useCallback((input: HTMLInputElement | null) => {
    imageInput.current = input;
    if (!input) return;
    return () => {
      imageInput.current = null;
    };
  }, []);
  const handleVideoInputRef = useCallback((input: HTMLInputElement | null) => {
    videoInput.current = input;
    if (!input) return;
    return () => {
      videoInput.current = null;
    };
  }, []);
  const editorProps = useMemo<EditorOptions['editorProps']>(
    () => ({
      attributes: {
        class: 'tiptap-editor-content',
        role: 'textbox',
        'aria-label': label,
        'aria-invalid': String(invalid),
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-multiline': 'true',
        'aria-placeholder': placeholder,
        'data-placeholder': placeholder,
        ...(id ? { id } : {}),
      },
      handleDOMEvents: {
        compositionstart: (view) => {
          view.dom.setAttribute('data-composing', 'true');
          return false;
        },
        compositionend: (view) => {
          queueMicrotask(() => {
            if (view.dom.isConnected) view.dom.removeAttribute('data-composing');
          });
          return false;
        },
      },
    }),
    [id, label, placeholder, labelledBy, describedBy, invalid],
  );
  const editor = useEditor({
    ...initial,
    immediatelyRender: false,
    editorProps,
    onCreate: ({ editor: current }) => showEmptyState(current),
    onTransaction: ({ editor: current }) => showEmptyState(current),
    onUpdate: ({ editor: current }) => {
      const delta = tiptapToRichText(current.getJSON());
      const parsed = RichTextDocumentSchema.safeParse(delta);
      onChange({
        body: richTextToPlainText(delta),
        document: parsed.success ? parsed.data : delta,
        valid: parsed.success,
      });
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);

  const handleAttach = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !editor) return;
      const viewport = window.visualViewport;
      const handleResize = () => {
        if (viewportFrame.current !== null) cancelAnimationFrame(viewportFrame.current);
        viewportFrame.current = requestAnimationFrame(() => {
          viewportFrame.current = null;
          if (editor.isDestroyed || !editor.isFocused || !editor.view.dom.isConnected) return;
          // Wait for the visible viewport shell to resize, then let ProseMirror
          // reveal the caret through its scrollable ancestors without changing
          // the document, selection or an active IME composition.
          editor.commands.scrollIntoView();
        });
      };
      window.addEventListener('resize', handleResize);
      viewport?.addEventListener('resize', handleResize);
      element.addEventListener('focusin', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        viewport?.removeEventListener('resize', handleResize);
        element.removeEventListener('focusin', handleResize);
        if (viewportFrame.current !== null) cancelAnimationFrame(viewportFrame.current);
        viewportFrame.current = null;
      };
    },
    [editor],
  );

  const handleUpload = async (file: File | undefined) => {
    if (!file || !editor || !onUploadMedia) return;
    try {
      const media = await onUploadMedia(file);
      if (editor.isDestroyed || !editor.view.dom.isConnected) return;
      const src = PostMediaUrlSchema.parse(media.url);
      // Insert at the current selection, which ProseMirror has mapped through
      // edits made while the upload was running, rather than a stale offset.
      editor
        .chain()
        .focus()
        .insertContent({
          type: media.kind === 'IMAGE' ? 'image' : 'video',
          attrs: { src },
        })
        .run();
    } catch {
      // The owning upload mutation displays errors and keeps the draft intact.
    }
  };

  return (
    <div
      className="rich-text-editor"
      data-disabled={disabled}
      data-invalid={invalid || undefined}
      ref={handleAttach}
    >
      {editor ? (
        <TiptapToolbar
          editor={editor}
          label={label}
          disabled={disabled}
          onPickImage={onUploadMedia ? () => imageInput.current?.click() : undefined}
          onPickVideo={onUploadMedia ? () => videoInput.current?.click() : undefined}
        />
      ) : null}
      <EditorContent editor={editor} />
      {onUploadMedia ? (
        <>
          <input
            ref={handleImageInputRef}
            type="file"
            hidden
            tabIndex={-1}
            accept={mediaAccept.image}
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void handleUpload(file);
            }}
          />
          <input
            ref={handleVideoInputRef}
            type="file"
            hidden
            tabIndex={-1}
            accept={mediaAccept.video}
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void handleUpload(file);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
