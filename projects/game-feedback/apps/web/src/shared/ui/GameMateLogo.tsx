import Image from 'next/image';

export function GameMateLogo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-title font-bold text-ink">
      <Image src="/icon.svg" width={32} height={32} alt="" className="size-8 shrink-0" />
      <span>Game Mate</span>
    </span>
  );
}
