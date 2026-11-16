'use client';

import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Check,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Video,
} from 'lucide-react';
import { match } from 'ts-pattern';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@side/design-system';

import { useI18n } from '@/shared/i18n';

import { openOverlay } from '../open-overlay';
import { TiptapLinkDialog } from './TiptapLinkDialog';

interface ITiptapToolbarProps {
  editor: Editor;
  disabled: boolean;
  label: string;
  onPickImage?: () => void;
  onPickVideo?: () => void;
}

export function TiptapToolbar({ editor, disabled, label, onPickImage, onPickVideo }: ITiptapToolbarProps) {
  const { t } = useI18n();
  const [focusedControl, setFocusedControl] = useState('bold');
  const returnFocusToEditor = useRef(false);
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      heading2: current.isActive('heading', { level: 2 }),
      heading3: current.isActive('heading', { level: 3 }),
      ordered: current.isActive('orderedList'),
      bullet: current.isActive('bulletList'),
      quote: current.isActive('blockquote'),
      link: current.isActive('link'),
    }),
  });
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.target)) return;
    const control = event.target.closest<HTMLElement>('[data-toolbar-control]');
    if (control?.dataset.toolbarControl) setFocusedControl(control.dataset.toolbarControl);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Portal events also bubble through React; menu navigation belongs to Base UI.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    const currentIndex = controls.findIndex((control) => control === event.target);
    if (currentIndex < 0) return;
    const nextIndex = match(event.key)
      .with('ArrowRight', () => (currentIndex + 1) % controls.length)
      .with('ArrowLeft', () => (currentIndex - 1 + controls.length) % controls.length)
      .with('Home', () => 0)
      .with('End', () => controls.length - 1)
      .otherwise(() => undefined);
    if (nextIndex === undefined) return;
    event.preventDefault();
    controls[nextIndex]?.focus();
  };
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="rich-text-toolbar"
      onFocusCapture={handleFocus}
      onKeyDown={handleKeyDown}
    >
      <div className="rich-text-toolbar-group">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
          aria-label={t('굵게')}
          title={t('굵게')}
          aria-pressed={active.bold}
          data-toolbar-control="bold"
          tabIndex={focusedControl === 'bold' ? 0 : -1}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
          aria-label={t('기울임')}
          title={t('기울임')}
          aria-pressed={active.italic}
          data-toolbar-control="italic"
          tabIndex={focusedControl === 'italic' ? 0 : -1}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
          aria-label={t('밑줄')}
          title={t('밑줄')}
          aria-pressed={active.underline}
          data-toolbar-control="underline"
          tabIndex={focusedControl === 'underline' ? 0 : -1}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
          aria-label={t('링크')}
          title={t('링크')}
          aria-pressed={active.link}
          data-toolbar-control="link"
          tabIndex={focusedControl === 'link' ? 0 : -1}
          onClick={() => openOverlay((control) => <TiptapLinkDialog {...control} editor={editor} />)}
        >
          <Link2 aria-hidden="true" />
        </Button>
      </div>
      <div className="rich-text-toolbar-group">
        {onPickImage && onPickVideo ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
              aria-label={t('사진 삽입')}
              title={t('사진 삽입')}
              data-toolbar-control="image"
              tabIndex={focusedControl === 'image' ? 0 : -1}
              onClick={onPickImage}
            >
              <ImagePlus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
              aria-label={t('동영상 삽입')}
              title={t('동영상 삽입')}
              data-toolbar-control="video"
              tabIndex={focusedControl === 'video' ? 0 : -1}
              onClick={onPickVideo}
            >
              <Video aria-hidden="true" />
            </Button>
          </>
        ) : null}
        <DropdownMenu
          disabled={disabled}
          onOpenChange={(open, details) => {
            returnFocusToEditor.current = !open && details.reason === 'item-press';
          }}
        >
          <DropdownMenuTrigger
            disabled={disabled}
            data-toolbar-control="more"
            tabIndex={focusedControl === 'more' ? 0 : -1}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('서식 더보기')}
                title={t('서식 더보기')}
              />
            }
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            aria-label={t('서식 더보기')}
            finalFocus={() => (returnFocusToEditor.current && !editor.isDestroyed ? editor.view.dom : true)}
          >
            <DropdownMenuItem
              aria-current={active.heading2 || undefined}
              onClick={() => {
                const chain = editor.chain().focus();
                if (!active.heading2) chain.clearNodes();
                chain.toggleHeading({ level: 2 }).run();
              }}
            >
              <Heading2 aria-hidden="true" />
              {t('제목 2')}
              {active.heading2 ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-current={active.heading3 || undefined}
              onClick={() => {
                const chain = editor.chain().focus();
                if (!active.heading3) chain.clearNodes();
                chain.toggleHeading({ level: 3 }).run();
              }}
            >
              <Heading3 aria-hidden="true" />
              {t('제목 3')}
              {active.heading3 ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-current={active.strike || undefined}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough aria-hidden="true" />
              {t('취소선')}
              {active.strike ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-current={active.ordered || undefined}
              onClick={() => {
                const chain = editor.chain().focus();
                if (!active.ordered) chain.clearNodes();
                chain.toggleOrderedList().run();
              }}
            >
              <ListOrdered aria-hidden="true" />
              {t('번호 목록')}
              {active.ordered ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-current={active.bullet || undefined}
              onClick={() => {
                const chain = editor.chain().focus();
                if (!active.bullet) chain.clearNodes();
                chain.toggleBulletList().run();
              }}
            >
              <List aria-hidden="true" />
              {t('글머리 목록')}
              {active.bullet ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-current={active.quote || undefined}
              onClick={() => {
                const chain = editor.chain().focus();
                if (!active.quote) chain.clearNodes();
                chain.toggleBlockquote().run();
              }}
            >
              <Quote aria-hidden="true" />
              {t('인용')}
              {active.quote ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
              <RemoveFormatting aria-hidden="true" />
              {t('서식 지우기')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
