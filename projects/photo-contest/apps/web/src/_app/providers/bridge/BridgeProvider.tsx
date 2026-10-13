'use client';

import type { IWebBridge } from '@photo-contest/bridge/web';
import type { ReactNode } from 'react';

import { BridgeContext, getWebBridge } from '@/shared/model/bridge';

import { useBridgeLifecycle } from './bridge-lifecycle.hook';

interface IBridgeProviderProps {
  children: ReactNode;
  /** 기본은 브라우저에서 한 번 만든 브리지(서버 렌더링에서는 null). 테스트에서 바꿔 끼운다. */
  bridge?: IWebBridge | null;
}

function BridgeLifecycle({ bridge }: { bridge: IWebBridge | null }) {
  useBridgeLifecycle(bridge);
  return null;
}

export function BridgeProvider({ children, bridge = getWebBridge() }: IBridgeProviderProps) {
  return (
    <BridgeContext value={bridge}>
      <BridgeLifecycle bridge={bridge} />
      {children}
    </BridgeContext>
  );
}
