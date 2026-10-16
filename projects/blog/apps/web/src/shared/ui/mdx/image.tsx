/* eslint-disable @next/next/no-img-element */
import Image from 'next/image';
import type { ComponentPropsWithoutRef } from 'react';
import imageSizes from '@/shared/config/image-sizes.json';

const dimensions = imageSizes as Record<string, { width: number; height: number }>;

export function MdxImage({ src, alt = '', ...props }: ComponentPropsWithoutRef<'img'>) {
  const size = typeof src === 'string' ? dimensions[src] : undefined;
  if (typeof src === 'string' && size)
    return (
      <Image
        {...props}
        src={src}
        alt={alt}
        width={size.width}
        height={size.height}
        sizes="(max-width: 800px) 100vw, 764px"
        loading="lazy"
      />
    );
  return <img {...props} src={src} alt={alt} loading="lazy" decoding="async" />;
}
