import { Globe2, LockKeyhole } from 'lucide-react';
import { match } from 'ts-pattern';

import { GroupVisibility } from '@/shared/api/generated';
import { Badge } from '@/shared/ui/@core/badge';

export function GroupVisibilityBadge({ visibility }: { visibility: GroupVisibility }) {
  return (
    <Badge className="rounded-full border border-line bg-surface text-ink">
      {match(visibility)
        .with(GroupVisibility.Private, () => (
          <>
            <LockKeyhole aria-hidden className="size-3" />
            비공개
          </>
        ))
        .with(GroupVisibility.Public, () => (
          <>
            <Globe2 aria-hidden className="size-3" />
            공개
          </>
        ))
        .exhaustive()}
    </Badge>
  );
}
