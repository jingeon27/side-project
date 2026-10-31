import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TPushRegistration } from '@photo-contest/bridge';
import { installFakeNativeApp, type IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge, type IWebBridge } from '@photo-contest/bridge/web';

import { BridgeContext } from '@/shared/model/bridge';

import { PushNotificationSettings } from './PushNotificationSettings';

const INSTALLATION_ID = '4b0f6a8e-3c1d-4e2f-9a7b-1c2d3e4f5a6b';
const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';

interface ISetup {
  registrations: Array<TPushRegistration['status']>;
  settings?: boolean;
  enabled?: boolean;
  failRegister?: boolean;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

async function renderSettings({
  registrations,
  settings = true,
  enabled = true,
  failRegister = false,
}: ISetup) {
  const statuses = [...registrations];
  const fake: IFakeNativeApp = installFakeNativeApp(window, {
    capabilities: {
      'notifications.registration': async () => {
        const status = statuses.shift() ?? 'undetermined';
        return {
          installationId: INSTALLATION_ID,
          platform: 'ios',
          status,
          token: status === 'granted' ? TOKEN : null,
        };
      },
      ...(settings ? { 'notifications.settings': async () => ({ opened: true }) } : {}),
    },
  });
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requests.push(url);
      if (failRegister && url.endsWith('/register')) throw new TypeError('Failed to fetch');
      return Response.json({ ok: true, enabled });
    }),
  );
  const bridge: IWebBridge = createWebBridge(window);
  cleanups.push(
    () => bridge.dispose(),
    () => fake.uninstall(),
  );
  await act(async () => {
    render(
      <BridgeContext value={bridge}>
        <PushNotificationSettings />
      </BridgeContext>,
    );
  });
  return { fake, requests };
}

const registrationCalls = (fake: IFakeNativeApp) =>
  fake.calls.filter(({ type }) => type === 'notifications.registration').map(({ payload }) => payload);

describe('PushNotificationSettings', () => {
  it('들어오면 권한을 묻지 않고 지금 상태를 맞춘 뒤 켜기 버튼을 보여줘야 한다', async () => {
    const { fake, requests } = await renderSettings({ registrations: ['undetermined'] });
    const region = screen.getByRole('region', { name: '앱 알림' });
    expect(await screen.findByText('새로운 소식을 앱 알림으로 받아보세요.')).toBeVisible();
    expect(registrationCalls(fake)).toEqual([{ requestPermission: false }]);
    expect(requests).toEqual(['/backend/push/devices/unregister']);
    expect(region).toContainElement(screen.getByRole('button', { name: '알림 켜기' }));
  });

  it('알림 켜기를 누르면 권한을 요청해 기기를 등록하고 켜진 상태를 보여줘야 한다', async () => {
    const { fake, requests } = await renderSettings({ registrations: ['undetermined', 'granted'] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '알림 켜기' }));

    expect(await screen.findByText('앱 알림이 켜져 있어요.')).toBeVisible();
    expect(registrationCalls(fake)).toEqual([{ requestPermission: false }, { requestPermission: true }]);
    expect(requests.at(-1)).toBe('/backend/push/devices/register');
    expect(screen.queryByRole('button', { name: '알림 켜기' })).not.toBeInTheDocument();
  });

  it('서버가 발송을 켜지 않았으면 허용해도 준비 중으로 안내해야 한다', async () => {
    await renderSettings({ registrations: ['granted'], enabled: false });
    expect(await screen.findByText('앱 알림을 준비하고 있어요. 잠시 후 다시 확인해 주세요.')).toBeVisible();
  });

  it('권한을 거부했으면 기기 설정을 열어야 한다', async () => {
    const { fake } = await renderSettings({ registrations: ['denied'] });
    const user = userEvent.setup();
    expect(await screen.findByText('기기 설정에서 알림을 허용해 주세요.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '기기 설정 열기' }));
    expect(fake.calls.map(({ type }) => type)).toContain('notifications.settings');
    expect(registrationCalls(fake)).toHaveLength(1);
  });

  it('누른 동작이 실패하면 다시 시도하라고 알려야 한다', async () => {
    await renderSettings({ registrations: ['undetermined', 'granted'], failRegister: true });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '알림 켜기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('알림 설정에 실패했어요. 다시 시도해 주세요.');
    expect(screen.getByRole('button', { name: '알림 켜기' })).toBeEnabled();
  });

  it('앱 WebView가 아니면 아무것도 그리지 않아야 한다', () => {
    const { container } = render(
      <BridgeContext value={null}>
        <PushNotificationSettings />
      </BridgeContext>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
