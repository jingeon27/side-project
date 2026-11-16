import { Node, wrappingInputRule } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';

import { PostMediaUrlSchema, RichTextAttributesSchema } from '@game-feedback/contracts';

function uploadedMediaNode(kind: 'image' | 'video') {
  return Node.create({
    name: kind,
    inline: true,
    group: 'inline',
    atom: true,
    draggable: true,
    addAttributes() {
      return { src: { default: null } };
    },
    parseHTML() {
      return [
        {
          tag: `${kind === 'image' ? 'img' : 'video'}[src]`,
          getAttrs: (element) => {
            const src = PostMediaUrlSchema.safeParse(element.getAttribute('src'));
            return src.success ? { src: src.data } : false;
          },
        },
      ];
    },
    renderHTML({ node }) {
      const src = PostMediaUrlSchema.parse(node.attrs.src);
      if (kind === 'image') return ['img', { src, alt: '', 'data-post-media': 'image' }];
      return [
        'video',
        {
          src,
          controls: '',
          playsinline: '',
          preload: 'metadata',
          contenteditable: 'false',
          'data-post-media': 'video',
        },
      ];
    },
  });
}

const PostBlockquote = Blockquote.extend({ content: 'paragraph+' });

const PostListItem = ListItem.extend({
  // The persisted format supports flat lists with one paragraph per item.
  content: 'paragraph',
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) };
  },
});

const PostOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      start: { default: 1, parseHTML: () => 1 },
      type: { default: null, parseHTML: () => null },
    };
  },
  addInputRules() {
    return [wrappingInputRule({ find: /^1\.\s$/, type: this.type })];
  },
});

export function createRichTextExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      trailingNode: false,
      heading: { levels: [2, 3] },
      listItem: false,
      orderedList: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        isAllowedUri: (href) => RichTextAttributesSchema.shape.link.safeParse(href).success,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      },
    }),
    PostBlockquote,
    PostListItem,
    PostOrderedList,
    uploadedMediaNode('image'),
    uploadedMediaNode('video'),
  ];
}
