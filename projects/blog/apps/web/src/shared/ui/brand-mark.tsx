interface BrandMarkProps {
  className?: string;
  size?: number;
  inverse?: boolean;
}

export function BrandMark({ className, size = 36, inverse = false }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g fill={inverse ? '#f7f3eb' : 'currentColor'}>
        <path d="M4 17.5c7-.8 13.2 1.5 18 5.2v21.5c-4.8-3.7-11-6-18-5.2Z" />
        <path d="M26 22.7c4.8-3.7 11-6 18-5.2V39c-7-.8-13.2 1.5-18 5.2Z" />
      </g>
      <path
        d="m34.5 1 2.2 4.3L41 7.5l-4.3 2.2-2.2 4.3-2.2-4.3L28 7.5l4.3-2.2Z"
        fill={inverse ? '#e8bd7c' : '#c48b45'}
      />
    </svg>
  );
}
