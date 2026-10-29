import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { enablePushMutationOptions } from '../model/push.mutation-options';
import { pushStatusOptions } from '../model/push.options';
import { PushNotificationSettings } from './PushNotificationSettings';

vi.mock('../model/push.options', () => ({ pushStatusOptions: vi.fn() }));
vi.mock('../model/push.mutation-options', () => ({ enablePushMutationOptions: vi.fn() }));

it('네이티브 푸시를 지원하지 않는 문서에서는 조회와 mutation을 만들지 않아야 한다', () => {
  const { container } = render(<PushNotificationSettings userId="viewer" />);
  expect(container.childElementCount).toBe(0);
  expect(pushStatusOptions).not.toHaveBeenCalled();
  expect(enablePushMutationOptions).not.toHaveBeenCalled();
});
