import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from '@/shared/ui/@core/avatar';

import { GroupImagePicker } from './GroupImagePicker';

const radius = (element: Element) => [...element.classList].filter((name) => name.startsWith('rounded'));

describe('GroupImagePicker', () => {
  // 그룹은 둥근 사각형, 사람은 원으로 구분하는데 그룹 만들기의 그룹 프로필 사진 미리보기는 원이었다.
  it('그룹 프로필 사진은 그룹 아바타와 같은 둥근 사각형으로 미리 보여야 한다', () => {
    const { container } = render(
      <>
        <GroupImagePicker label="그룹 프로필 사진" value={null} onChange={() => undefined} />
        <Avatar name="웃음 연구소" size="lg" shape="square" tone="outline" />
      </>,
    );
    expect(radius(screen.getByLabelText('그룹 프로필 사진 선택').closest('label')!)).toEqual(
      radius(container.querySelector('[data-slot="avatar"]')!),
    );
  });
});
