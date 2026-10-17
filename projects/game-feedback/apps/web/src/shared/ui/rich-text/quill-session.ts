import type Quill from 'quill';
import { RichTextDocumentSchema, type TRichTextDocument } from '@game-feedback/contracts';

export interface IEditorValue {
  body: string;
  document: TRichTextDocument | null;
  valid: boolean;
}
export interface IQuillOptions {
  body: string;
  document?: TRichTextDocument | null;
  label: string;
  id?: string;
  labels: Record<string, string>;
  onChange: (value: IEditorValue) => void;
  onError: (error: Error) => void;
}
class QuillSession {
  private readonly lifetime = new AbortController();
  private editor?: Quill;
  private disabled = false;
  constructor(
    private readonly root: HTMLDivElement,
    private readonly options: IQuillOptions,
  ) {
    void this.start().catch((error: unknown) => {
      if (!this.lifetime.signal.aborted)
        options.onError(error instanceof Error ? error : new Error('Editor unavailable'));
    });
  }
  private async start() {
    const { default: Editor } = await import('quill');
    if (this.lifetime.signal.aborted) return;
    const host = document.createElement('div');
    this.root.append(host);
    this.editor = new Editor(host, {
      theme: 'snow',
      bounds: this.root,
      formats: ['bold', 'italic', 'underline', 'strike', 'header', 'list', 'blockquote', 'link'],
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ header: 2 }, { header: 3 }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'link', 'clean'],
        ],
      },
    });
    this.editor.root.setAttribute('role', 'textbox');
    this.editor.root.setAttribute('aria-label', this.options.label);
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
  private failure: Error | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly options: Omit<IQuillOptions, 'onError'>) {}
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
    const session = new QuillSession(root, { ...this.options, onError: this.reportError });
    session.setDisabled(this.disabled);
    this.session = session;
    return session.dispose;
  };
  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    this.session?.setDisabled(disabled);
  }
}
