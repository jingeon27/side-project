'use client';

import { Button as PrimitiveButton, type IButtonProps } from '@side/design-system';

import { useIsSSR } from '../../../model/is-ssr.hook';

export type { IButtonProps } from '@side/design-system';
export { ButtonLink } from '@side/design-system/next';

/** 부모의 hydration 표시보다 이 버튼의 이벤트 연결이 늦을 수 있어 준비된 뒤 활성화한다. */
export function Button({ disabled, ...props }: IButtonProps) {
  const isSSR = useIsSSR();
  return <PrimitiveButton {...props} disabled={isSSR || disabled} />;
}
