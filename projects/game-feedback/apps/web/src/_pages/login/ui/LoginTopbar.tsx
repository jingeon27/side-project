'use client';
import { Topbar } from '@/widgets/community-shell';

export function LoginTopbar({ returnTo }: { returnTo: string }) {
  return (
    <Topbar.Root>
      <Topbar.Back href={returnTo} logicalParent={returnTo} />
      <Topbar.Actions>
        <Topbar.Language />
      </Topbar.Actions>
    </Topbar.Root>
  );
}
