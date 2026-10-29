import Image from 'next/image';

import { cn } from '@side/design-system';

import clashRoyaleIcon from '../assets/clash-royale-icon.jpg';

interface IClashRoyaleIconProps {
  size?: number;
  className?: string;
}

export function ClashRoyaleIcon({ size = 32, className }: IClashRoyaleIconProps) {
  return (
    <Image
      src={clashRoyaleIcon}
      alt=""
      width={size}
      height={size}
      className={cn('clash-royale-icon', className)}
    />
  );
}
