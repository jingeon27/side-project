import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RichTextDocumentSchema } from '@game-feedback/contracts';

import { tiptapToRichText } from './tiptap-document';
import { createRichTextExtensions } from './tiptap-extensions';
import { TiptapToolbar } from './TiptapToolbar';

const editors = new Set<Editor>();

afterEach(() => {
  editors.forEach((editor) => editor.destroy());
  editors.clear();
});

function renderToolbar(content = '<p>앞 선택 뒤</p>') {
  const editor = new Editor({
    extensions: createRichTextExtensions(),
    content,
    // jsdom has no range geometry; caret scrolling is covered by the browser lane.
    editorProps: { handleScrollToSelection: () => true },
  });
  editors.add(editor);
  const onPickImage = vi.fn();
  const onPickVideo = vi.fn();
  render(
    <>
      <TiptapToolbar
        editor={editor}
        disabled={false}
        label="본문"
        onPickImage={onPickImage}
        onPickVideo={onPickVideo}
      />
      <EditorContent editor={editor} />
    </>,
  );
  return { editor, onPickImage, onPickVideo };
}

describe('compact Tiptap toolbar', () => {
  it('keeps common formatting and media directly available with one toolbar tab stop', () => {
    const { onPickImage, onPickVideo } = renderToolbar();
    const toolbar = screen.getByRole('toolbar', { name: '본문' });
    const buttons = within(toolbar).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([
      screen.getByRole('button', { name: '굵게' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: '사진 삽입' }));
    fireEvent.click(screen.getByRole('button', { name: '동영상 삽입' }));
    expect(onPickImage).toHaveBeenCalledOnce();
    expect(onPickVideo).toHaveBeenCalledOnce();
  });

  it('normalizes a quote into a heading and clears formatting without losing the text', async () => {
    const { editor } = renderToolbar('<blockquote><p><strong>선택 문장</strong></p></blockquote>');
    act(() => editor.commands.selectAll());
    fireEvent.click(screen.getByRole('button', { name: '서식 더보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '제목 2' }));
    await waitFor(() => expect(editor.isActive('heading', { level: 2 })).toBe(true));
    expect(editor.isActive('blockquote')).toBe(false);
    expect(editor.getText()).toBe('선택 문장');
    expect(editor.isActive('bold')).toBe(true);
    expect(RichTextDocumentSchema.safeParse(tiptapToRichText(editor.getJSON())).success).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '서식 더보기' }));
    const heading = await screen.findByRole('menuitem', { name: '제목 2' });
    expect(heading.getAttribute('aria-current')).toBe('true');
    expect(heading.hasAttribute('aria-checked')).toBe(false);
    fireEvent.click(screen.getByRole('menuitem', { name: '서식 지우기' }));
    await waitFor(() => expect(editor.isActive('paragraph')).toBe(true));
    expect(editor.isActive('bold')).toBe(false);
    expect(editor.getText()).toBe('선택 문장');
    expect(RichTextDocumentSchema.safeParse(tiptapToRichText(editor.getJSON())).success).toBe(true);
  });

  it('applies a secondary inline format to the saved editor selection', async () => {
    const { editor } = renderToolbar();
    act(() => editor.commands.setTextSelection({ from: 3, to: 5 }));
    fireEvent.click(screen.getByRole('button', { name: '서식 더보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '취소선' }));
    await waitFor(() =>
      expect(tiptapToRichText(editor.getJSON()).ops).toEqual([
        { insert: '앞 ' },
        { insert: '선택', attributes: { strike: true } },
        { insert: ' 뒤\n' },
      ]),
    );
    await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
  });

  it('moves between controls with arrow keys and leaves Tab available for the body', () => {
    renderToolbar();
    const toolbar = screen.getByRole('toolbar', { name: '본문' });
    const bold = screen.getByRole('button', { name: '굵게' });
    const italic = screen.getByRole('button', { name: '기울임' });
    const more = screen.getByRole('button', { name: '서식 더보기' });
    act(() => bold.focus());
    fireEvent.keyDown(bold, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(more);
    fireEvent.keyDown(more, { key: 'Home' });
    expect(document.activeElement).toBe(bold);
    fireEvent.keyDown(bold, { key: 'End' });
    expect(document.activeElement).toBe(more);
    fireEvent.keyDown(more, { key: 'ArrowRight' });
    fireEvent.keyDown(bold, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(italic);
    expect(
      within(toolbar)
        .getAllByRole('button')
        .filter((button) => button.tabIndex === 0),
    ).toEqual([italic]);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    italic.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it('lets the menu own arrow navigation and returns to its trigger on Escape', async () => {
    renderToolbar();
    const more = screen.getByRole('button', { name: '서식 더보기' });
    act(() => more.focus());
    fireEvent.keyDown(more, { key: 'ArrowDown' });
    const heading2 = await screen.findByRole('menuitem', { name: '제목 2' });
    const heading3 = screen.getByRole('menuitem', { name: '제목 3' });
    await waitFor(() => expect(document.activeElement).toBe(heading2));
    fireEvent.keyDown(heading2, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(heading3));
    fireEvent.keyDown(heading3, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});
