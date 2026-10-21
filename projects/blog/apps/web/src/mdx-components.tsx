import type { MDXComponents } from 'mdx/types';

import { CodeBlock } from '@/shared/ui/code-block/code-block';
import { Callout } from '@/shared/ui/mdx/callout';
import { Decision } from '@/shared/ui/mdx/decision';
import { Figure } from '@/shared/ui/mdx/figure';
import { MdxImage } from '@/shared/ui/mdx/image';
import { Summary } from '@/shared/ui/mdx/summary';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    pre: CodeBlock,
    table: (props) => (
      <div className="table-scroll" tabIndex={0}>
        <table {...props} />
      </div>
    ),
    img: MdxImage,
    a: ({ href, ...props }) => (
      <a
        href={href}
        {...props}
        {...(href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      />
    ),
    Summary,
    Decision,
    Callout,
    Figure,
    CodeBlock,
    ...components,
  };
}
