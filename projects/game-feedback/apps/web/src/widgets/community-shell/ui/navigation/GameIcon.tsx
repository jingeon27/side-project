import { Gamepad2 } from 'lucide-react';

import { ClashRoyaleIcon } from '@/features/game-profile';

export function GameIcon({ slug, size = 28 }: { slug: string; size?: number }) {
  return slug === 'clash-royale' ? <ClashRoyaleIcon size={size} /> : <Gamepad2 size={size} />;
}
