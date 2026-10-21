import type { ReactNode } from 'react';

import { MdxImage } from './image';

export function Figure({
  src,
  alt,
  caption,
  width,
  height,
  children,
}: {
  src?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  children?: ReactNode;
}) {
  return (
    <figure className="mdx-figure">
      {src && <MdxImage src={src} alt={alt ?? ''} width={width} height={height} />}
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
