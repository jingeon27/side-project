'use client';

import { IconButton as PrimitiveIconButton, type IIconButtonProps } from '@side/design-system';

import { useIsSSR } from '../../../model/is-ssr.hook';

export type { IIconButtonProps } from '@side/design-system';

export function IconButton({ disabled, ...props }: IIconButtonProps) {
  const isSSR = useIsSSR();
  return <PrimitiveIconButton {...props} disabled={isSSR || disabled} />;
}
