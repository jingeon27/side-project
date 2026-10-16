export function Avatar({ name, size = 'normal' }: { name: string; size?: 'small' | 'normal' | 'large' }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
