import type Quill from 'quill';
import { BlockEmbed } from 'quill/blots/block';

import { PostMediaUrlSchema } from '@game-feedback/contracts';

class UploadedVideo extends BlockEmbed {
  static blotName = 'video';
  static tagName = 'VIDEO';
  static className = 'ql-video';
  static create(value: unknown) {
    const node = super.create() as HTMLVideoElement;
    node.setAttribute('src', PostMediaUrlSchema.parse(value));
    node.setAttribute('controls', '');
    node.setAttribute('playsinline', '');
    node.setAttribute('preload', 'metadata');
    return node;
  }
  static value(node: HTMLElement) {
    return PostMediaUrlSchema.parse(node.getAttribute('src'));
  }
}
export function registerPostMediaFormats(Editor: typeof Quill) {
  Editor.register(UploadedVideo, true);
}
