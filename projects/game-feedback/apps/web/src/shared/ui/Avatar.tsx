import { Avatar as DesignSystemAvatar } from '@side/design-system';

export function Avatar({
  name,
  src,
  size = 'normal',
}: {
  name: string;
  src?: string | null;
  size?: 'small' | 'normal' | 'large';
}) {
  const sizes = { small: 'sm', normal: 'md', large: 'lg' } as const;
  return <DesignSystemAvatar src={src} name={name} size={sizes[size]} className={`avatar avatar-${size}`} />;
}
