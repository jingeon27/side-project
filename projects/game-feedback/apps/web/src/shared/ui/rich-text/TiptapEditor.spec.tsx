import { StrictMode } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';

import { RichTextDocumentSchema, type TPostMedia } from '@game-feedback/contracts';

import type { IEditorValue } from './rich-text-editor.types';
import { TiptapEditor } from './TiptapEditor';

// Keep these tests about the React/editor lifetime. The real toolbar, link dialog,
// file chooser and mobile layout are exercised in the browser lane.
vi.mock('./TiptapToolbar', () => ({
  TiptapToolbar: ({ editor, disabled }: { editor: Editor; disabled: boolean }) => (
    <div>
      <button disabled={disabled} onClick={() => editor.commands.insertContent(' 새 내용')}>
        내용 추가
      </button>
      <button disabled={disabled} onClick={() => editor.commands.insertContent('가'.repeat(10002))}>
        긴 내용 추가
      </button>
    </div>
  ),
}));

const initialDocument = RichTextDocumentSchema.parse({
  ops: [
    { insert: '초안', attributes: { bold: true } },
    { insert: { image: '/api/post-media/existing-image' } },
    { insert: '\n' },
  ],
});
const uploadedImage: TPostMedia = {
  id: 'new-image',
  name: 'new.png',
  mimeType: 'image/png',
  size: 100,
  kind: 'IMAGE',
  url: '/api/post-media/new-image',
};

describe('Tiptap editor lifetime and draft preservation', () => {
  it('uses the latest callback without remounting or replacing the formatted draft', async () => {
    const firstChange = vi.fn<(value: IEditorValue) => void>();
    const latestChange = vi.fn<(value: IEditorValue) => void>();
    const view = render(
      <StrictMode>
        <TiptapEditor body="초안" document={initialDocument} label="본문" onChange={firstChange} />
      </StrictMode>,
    );
    const textbox = await screen.findByRole('textbox', { name: '본문' });
    expect(textbox.querySelectorAll('strong')).toHaveLength(1);
    view.rerender(
      <StrictMode>
        <TiptapEditor body="초안" document={initialDocument} label="본문" onChange={latestChange} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: '내용 추가' }));
    await waitFor(() => expect(latestChange).toHaveBeenCalledOnce());
    expect(firstChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '본문' })).toBe(textbox);
    expect(latestChange.mock.calls[0]?.[0].body).toContain('새 내용');
    expect(textbox.querySelector('img')?.getAttribute('src')).toBe('/api/post-media/existing-image');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('updates disabled and placeholder props while retaining the same editor and content', async () => {
    const onChange = vi.fn();
    const view = render(
      <TiptapEditor body="초안" label="본문" placeholder="처음 안내" onChange={onChange} />,
    );
    const textbox = await screen.findByRole('textbox', { name: '본문' });
    view.rerender(
      <TiptapEditor
        body="다른 외부 값"
        label="본문"
        placeholder="변경된 안내"
        disabled
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(textbox.getAttribute('contenteditable')).toBe('false'));
    expect(textbox.getAttribute('data-placeholder')).toBe('변경된 안내');
    expect(textbox.textContent).toBe('초안');
    view.rerender(
      <TiptapEditor body="다른 외부 값" label="본문" placeholder="변경된 안내" onChange={onChange} />,
    );
    await waitFor(() => expect(textbox.getAttribute('contenteditable')).toBe('true'));
    expect(screen.getByRole('textbox', { name: '본문' })).toBe(textbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps media and formatting in an invalid draft so a remount cannot discard them', async () => {
    const onChange = vi.fn<(value: IEditorValue) => void>();
    const view = render(
      <TiptapEditor body="초안" document={initialDocument} label="본문" onChange={onChange} />,
    );
    await screen.findByRole('textbox', { name: '본문' });
    fireEvent.click(screen.getByRole('button', { name: '긴 내용 추가' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    const draft = onChange.mock.calls[0]?.[0];
    expect(draft?.valid).toBe(false);
    expect(draft?.document).toBeTruthy();
    view.rerender(
      <TiptapEditor
        key="another-board"
        body={draft?.body ?? ''}
        document={draft?.document}
        label="본문"
        onChange={onChange}
      />,
    );
    const textbox = await screen.findByRole('textbox', { name: '본문' });
    expect(textbox.querySelector('img')?.getAttribute('src')).toBe('/api/post-media/existing-image');
    expect(textbox.querySelector('strong')?.textContent).toContain('초안');
    expect(textbox.textContent?.length).toBeGreaterThan(10000);
  });

  it('ignores an upload that resolves after unmount and preserves the draft after a failed upload', async () => {
    const pending = Promise.withResolvers<TPostMedia>();
    const onUploadMedia = vi.fn(() => pending.promise);
    const onChange = vi.fn();
    const view = render(
      <TiptapEditor
        body="초안"
        document={initialDocument}
        label="본문"
        onChange={onChange}
        onUploadMedia={onUploadMedia}
      />,
    );
    const textbox = await screen.findByRole('textbox', { name: '본문' });
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('Missing image picker');
    fireEvent.change(input, { target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] } });
    expect(onUploadMedia).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => pending.resolve(uploadedImage));
    expect(onChange).not.toHaveBeenCalled();
    expect(textbox.querySelector('img')?.getAttribute('src')).toBe('/api/post-media/existing-image');

    const failedUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));
    const retry = render(
      <TiptapEditor
        body="초안"
        document={initialDocument}
        label="본문"
        onChange={onChange}
        onUploadMedia={failedUpload}
      />,
    );
    const retryTextbox = await screen.findByRole('textbox', { name: '본문' });
    const retryInput = retry.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!retryInput) throw new Error('Missing retry image picker');
    await act(async () =>
      fireEvent.change(retryInput, {
        target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] },
      }),
    );
    expect(failedUpload).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(retryTextbox.textContent).toBe('초안');
    expect(retryTextbox.querySelector('strong')?.textContent).toBe('초안');
    expect(retryTextbox.querySelector('img')?.getAttribute('src')).toBe('/api/post-media/existing-image');
  });
});
