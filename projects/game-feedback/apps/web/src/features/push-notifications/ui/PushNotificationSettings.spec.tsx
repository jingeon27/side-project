import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PushNotificationSettings } from './PushNotificationSettings';

const device = vi.hoisted(() => ({ synchronize: vi.fn(), postToNative: vi.fn() }));
vi.mock('../api/push-registration', () => ({ synchronizePush: device.synchronize }));
vi.mock('@/shared/native', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  supportsNativePush: () => true,
  postToNative: device.postToNative,
}));

function renderSettings() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PushNotificationSettings userId="viewer" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  device.synchronize.mockReset();
  device.postToNative.mockReset();
});

describe('app notification settings', () => {
  it('shows the checked device status and the status returned after enabling', async () => {
    device.synchronize.mockImplementation(async (requestPermission: boolean) =>
      requestPermission ? 'granted' : 'undetermined',
    );
    renderSettings();
    await waitFor(() => expect(device.synchronize).toHaveBeenCalledWith(false, 'ko'));
    expect(screen.getByRole('status').textContent).toBe('새로운 소식을 앱 알림으로 받아보세요.');
    fireEvent.click(screen.getByRole('button', { name: '알림 켜기' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('앱 알림이 켜져 있어요.'));
    expect(device.synchronize).toHaveBeenLastCalledWith(true, 'ko');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the device settings instead of asking again after the permission was denied', async () => {
    device.synchronize.mockResolvedValue('denied');
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: '기기 설정 열기' }));
    expect(device.postToNative).toHaveBeenCalledWith({ type: 'push-settings' });
    expect(device.synchronize).toHaveBeenCalledOnce();
  });
});
