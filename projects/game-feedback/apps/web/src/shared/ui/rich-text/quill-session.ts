import type Quill from 'quill';

import { RichTextDocumentSchema, type TPostMedia, type TRichTextDocument } from '@game-feedback/contracts';

import { mediaAccept } from '@/shared/lib/media-types';

export interface IEditorValue {
  body: string;
  document: TRichTextDocument | null;
  valid: boolean;
}
export interface IQuillOptions {
  body: string;
  document?: TRichTextDocument | null;
  label: string;
  placeholder?: string;
  id?: string;
  labels: Record<string, string>;
  onChange: (value: IEditorValue) => void;
  onError: (error: Error) => void;
  onUploadMedia?: (file: File) => Promise<TPostMedia>;
}
class QuillSession {
  private readonly lifetime = new AbortController();
  private editor?: Quill;
  private disabled = false;
  private placeholder: string;
  constructor(
    private readonly root: HTMLDivElement,
    private readonly options: IQuillOptions,
  ) {
    this.placeholder = options.placeholder ?? '';
    void this.start().catch((error: unknown) => {
      if (!this.lifetime.signal.aborted)
        options.onError(error instanceof Error ? error : new Error('Editor unavailable'));
    });
  }
  private async start() {
    const { default: Editor } = await import('quill');
    const { registerPostMediaFormats } = await import('./quill-media');
    registerPostMediaFormats(Editor);
    if (this.lifetime.signal.aborted) return;
    const host = document.createElement('div');
    this.root.append(host);
    this.editor = new Editor(host, {
      theme: 'snow',
      placeholder: this.placeholder,
      bounds: this.root,
      formats: [
        'bold',
        'italic',
        'underline',
        'strike',
        'header',
        'list',
        'blockquote',
        'link',
        'image',
        'video',
      ],
      modules: {
        toolbar: {
          container: [
            ['bold', 'italic', 'underline', 'strike'],
            [{ header: 2 }, { header: 3 }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link', 'clean'],
            ...(this.options.onUploadMedia ? [['image', 'video']] : []),
          ],
          handlers: { image: () => this.pickMedia('image'), video: () => this.pickMedia('video') },
        },
      },
    });
    // Quill batches its model while an IME composition is active, so ql-blank
    // can remain set after the first visible character. Keep placeholder display
    // independent of that batch without forcing a model update mid-composition.
    this.editor.root.addEventListener(
      'compositionstart',
      () => {
        this.editor?.root.setAttribute('data-composing', 'true');
      },
      { signal: this.lifetime.signal },
    );
    this.editor.root.addEventListener(
      'compositionend',
      () => {
        queueMicrotask(() => this.editor?.root.removeAttribute('data-composing'));
      },
      { signal: this.lifetime.signal },
    );
    this.editor.root.setAttribute('role', 'textbox');
    this.editor.root.setAttribute('aria-label', this.options.label);
    this.editor.root.setAttribute('aria-placeholder', this.placeholder);
    this.editor.root.setAttribute('aria-multiline', 'true');
    if (this.options.id) this.editor.root.id = this.options.id;
    this.root.querySelectorAll<HTMLButtonElement>('.ql-toolbar button').forEach((button) => {
      button.type = 'button';
      const key = `${button.className.replace('ql-', '')}${button.value ? `-${button.value}` : ''}`;
      const label = this.options.labels[key];
      if (label) {
        button.setAttribute('aria-label', label);
        button.title = label;
      }
    });
    const tooltip = this.root.querySelector<HTMLElement>('.ql-tooltip');
    tooltip?.setAttribute('data-tip-label', this.options.labels['link-url'] ?? 'URL');
    tooltip?.querySelector('input')?.setAttribute('aria-label', this.options.labels['link-url'] ?? 'URL');
    tooltip?.querySelectorAll<HTMLElement>('.ql-action,.ql-remove').forEach((action) => {
      const remove = action.classList.contains('ql-remove');
      action.setAttribute('role', 'button');
      action.tabIndex = 0;
      action.setAttribute('aria-label', this.options.labels[remove ? 'remove-link' : 'save-link'] ?? 'Link');
      action.setAttribute('data-label', this.options.labels[remove ? 'remove-link' : 'save-link'] ?? 'Link');
      action.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          action.click();
        }
      });
    });
    if (this.options.document) this.editor.setContents(this.options.document.ops, 'silent');
    if (!this.options.document) this.editor.setText(this.options.body, 'silent');
    this.editor.enable(!this.disabled);
    this.editor.on('text-change', this.change);
  }
  private pickMedia(kind: 'image' | 'video') {
    if (this.disabled || !this.editor || !this.options.onUploadMedia) return;
    const index = this.editor.getSelection(true)?.index ?? this.editor.getLength() - 1;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mediaAccept[kind];
    input.hidden = true;
    this.root.append(input);
    input.addEventListener('cancel', () => input.remove(), { once: true, signal: this.lifetime.signal });
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        void this.options
          .onUploadMedia?.(file)
          .then((media) => {
            if (!this.editor || this.lifetime.signal.aborted) return;
            this.editor.insertEmbed(index, media.kind === 'IMAGE' ? 'image' : 'video', media.url, 'api');
            this.editor.setSelection(index + 1, 0, 'silent');
          })
          .catch(() => {
            /* The owning upload mutation preserves the draft and displays its error. */
          });
      },
      { once: true, signal: this.lifetime.signal },
    );
    input.click();
  }
  private change = () => {
    if (!this.editor || this.lifetime.signal.aborted) return;
    const document = RichTextDocumentSchema.safeParse(this.editor.getContents());
    this.options.onChange({
      body: this.editor.getText().trim(),
      document: document.success ? document.data : null,
      valid: document.success,
    });
  };
  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    this.editor?.enable(!disabled);
  }
  setPlaceholder(placeholder: string) {
    this.placeholder = placeholder;
    this.editor?.root.setAttribute('data-placeholder', placeholder);
    this.editor?.root.setAttribute('aria-placeholder', placeholder);
  }
  dispose = () => {
    this.lifetime.abort();
    this.editor?.off('text-change', this.change);
    this.editor?.disable();
    this.root.replaceChildren();
  };
}
export class QuillController {
  private session?: QuillSession;
  private disabled = false;
  private placeholder: string;
  private failure: Error | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly options: Omit<IQuillOptions, 'onError'>) {
    this.placeholder = options.placeholder ?? '';
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.failure;
  getServerSnapshot = () => null;
  private reportError = (failure: Error) => {
    this.failure = failure;
    this.listeners.forEach((listener) => listener());
  };
  attach = (root: HTMLDivElement | null) => {
    if (!root) return;
    const session = new QuillSession(root, {
      ...this.options,
      placeholder: this.placeholder,
      onError: this.reportError,
    });
    session.setDisabled(this.disabled);
    this.session = session;
    return session.dispose;
  };
  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    this.session?.setDisabled(disabled);
  }
  setPlaceholder(placeholder: string) {
    this.placeholder = placeholder;
    this.session?.setPlaceholder(placeholder);
  }
}
