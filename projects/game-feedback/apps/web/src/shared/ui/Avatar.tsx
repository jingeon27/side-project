import { Avatar as DesignSystemAvatar } from '@side/design-system';

export function Avatar({ name, size = 'normal' }: { name: string; size?: 'small' | 'normal' | 'large' }) {
  const sizes = { small: 'sm', normal: 'md', large: 'lg' } as const;
  return <DesignSystemAvatar name={name} size={sizes[size]} className={`avatar avatar-${size}`} />;
}
