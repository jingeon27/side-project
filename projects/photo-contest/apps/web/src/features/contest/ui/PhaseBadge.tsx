import type { Phase } from '@/shared/api/generated';
import { Badge } from '@/shared/ui/@core/badge';

import { getPhaseLabel, getPhaseTone } from '../lib/phase.helper';

export function PhaseBadge({ phase, className }: { phase: Phase; className?: string }) {
  return (
    <Badge tone={getPhaseTone(phase)} className={className}>
      {getPhaseLabel(phase)}
    </Badge>
  );
}
