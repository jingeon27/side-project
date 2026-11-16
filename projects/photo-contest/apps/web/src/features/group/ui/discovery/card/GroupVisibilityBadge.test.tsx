import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GroupVisibility } from '@/shared/api/generated';
import { Badge } from '@/shared/ui/@core/badge';

import { GroupVisibilityBadge } from './GroupVisibilityBadge';

describe('GroupVisibilityBadge', () => {
  it.each([
    ['비공개', GroupVisibility.Private],
    ['공개', GroupVisibility.Public],
  ])(
    '%s 배지는 className으로 덮어쓰지 않고 공통 outline 배지 모양을 그대로 써야 한다',
    (label, visibility) => {
      render(
        <>
          <GroupVisibilityBadge visibility={visibility} />
          <Badge tone="outline">기준</Badge>
        </>,
      );
      expect(screen.getByText(label).className).toBe(screen.getByText('기준').className);
    },
  );
});
