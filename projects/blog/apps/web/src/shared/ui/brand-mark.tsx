interface BrandMarkProps {
  className?: string;
  size?: number;
  imageHref?: string;
}

export function BrandMark({
  className,
  size = 36,
  imageHref = '/images/brand/bambyul-mascot.png',
}: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain image element for the shared logo.
    <img
      className={className}
      width={size}
      height={size}
      src={imageHref}
      alt=""
      aria-hidden="true"
      style={{ backgroundColor: '#f7f3eb', borderRadius: '25%' }}
    />
  );
}
