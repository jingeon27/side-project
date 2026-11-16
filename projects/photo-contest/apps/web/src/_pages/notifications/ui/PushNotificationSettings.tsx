'use client';

import { startTransition, useActionState, useEffect } from 'react';

import { match } from 'ts-pattern';

import type { IWebBridge } from '@photo-contest/bridge/web';

import { synchronizePush, type TPushStatus } from '@/features/push-notifications';
import { useBridge, useNativeApp } from '@/shared/model/bridge';
import { Button } from '@/shared/ui/@core/button';

type TPushAction = 'check' | 'enable' | 'openSettings';

interface IPushSettingsState {
  /** 첫 확인이 끝나기 전에는 null */
  status: TPushStatus | null;
  /** 사용자가 누른 동작이 실패했는지. 화면에 들어올 때의 확인 실패는 알리지 않는다. */
  failed: boolean;
}

const INITIAL_STATE: IPushSettingsState = { status: null, failed: false };

function PushNotificationPanel({ bridge }: { bridge: IWebBridge }) {
  const canOpenSettings = bridge.supports('notifications.settings');
  // 진행·실패를 useState로 따로 들지 않고 동작의 결과 상태와 pending으로 읽는다.
  const [{ status, failed }, dispatch, pending] = useActionState(
    async (previous: IPushSettingsState, action: TPushAction): Promise<IPushSettingsState> => {
      try {
        return await match(action)
          .with('check', async () => ({ status: await synchronizePush(bridge, false), failed: false }))
          .with('enable', async () => ({ status: await synchronizePush(bridge, true), failed: false }))
          .with('openSettings', async () => {
            await bridge.request('notifications.settings', {});
            return { ...previous, failed: false };
          })
          .exhaustive();
      } catch {
        return { ...previous, failed: action !== 'check' };
      }
    },
    INITIAL_STATE,
  );
  useEffect(() => {
    startTransition(() => dispatch('check'));
  }, [dispatch]);

  const message = match(status)
    .with('unavailable', () => '앱 알림을 준비하고 있어요. 잠시 후 다시 확인해 주세요.')
    .with('granted', () => '앱 알림이 켜져 있어요.')
    .with('denied', () => '기기 설정에서 알림을 허용해 주세요.')
    .with('undetermined', null, () => '새로운 소식을 앱 알림으로 받아보세요.')
    .exhaustive();
  const opensSettings = status === 'denied' && canOpenSettings;
  return (
    <section
      aria-label="앱 알림"
      className="flex flex-col items-start gap-3 rounded-xl border border-line p-4"
    >
      <h2 className="text-body font-semibold">앱 알림</h2>
      <p role="status" className="text-caption text-muted">
        {message}
      </p>
      {status !== 'granted' ? (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() => startTransition(() => dispatch(opensSettings ? 'openSettings' : 'enable'))}
        >
          {status === 'denied' ? '기기 설정 열기' : '알림 켜기'}
        </Button>
      ) : null}
      {failed ? (
        <p role="alert" className="text-caption text-danger">
          알림 설정에 실패했어요. 다시 시도해 주세요.
        </p>
      ) : null}
    </section>
  );
}

/** 앱 WebView가 알림 등록을 지원할 때만 권한 상태와 켜기 버튼을 보여 준다. */
export function PushNotificationSettings() {
  const bridge = useBridge();
  const app = useNativeApp();
  if (!app || !bridge?.supports('notifications.registration')) return null;
  return <PushNotificationPanel bridge={bridge} />;
}
