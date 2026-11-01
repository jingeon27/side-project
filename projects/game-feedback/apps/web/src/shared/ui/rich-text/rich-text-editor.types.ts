import type { TPostMedia, TRichTextDocument } from '@game-feedback/contracts';

export interface IEditorValue {
  body: string;
  document: TRichTextDocument | null;
  valid: boolean;
}

export interface IRichTextEditorProps {
  body: string;
  document?: TRichTextDocument | null;
  onChange: (value: IEditorValue) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  id?: string;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  onUploadMedia?: (file: File) => Promise<TPostMedia>;
}
