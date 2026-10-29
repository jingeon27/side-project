import { useEffect, useState } from 'react';

import { API_BASE } from '@/shared/config/env';

import { fetchAppConfig, type TFetch } from '../api/app-config.api';
import { isUpdateRequired } from '../lib/version.helper';

const APP_CONFIG_TIMEOUT_MS = 5_000;

export type TVersionGate =
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'update-required'; minimumVersion: string; latestVersion: string };

interface IUseVersionGateOptions {
  /** 읽지 못했으면 null. 그때는 검사하지 않는다. */
  appVersion: string | null;
  fetchImpl?: TFetch;
}

function defaultFetch(input: string, init?: RequestInit) {
  return fetch(input, init);
}

/**
 * 최소 버전보다 낮은 앱만 업데이트 화면으로 보낸다.
 * 설정을 읽지 못하면(오프라인·서버 오류·시간 초과) 막지 않는다. 오프라인 사용자를 가두지 않기 위해서다.
 */
export function useVersionGate({
  appVersion,
  fetchImpl = defaultFetch,
}: IUseVersionGateOptions): TVersionGate {
  const [gate, setGate] = useState<TVersionGate>(() =>
    appVersion ? { status: 'checking' } : { status: 'ok' },
  );

  useEffect(() => {
    if (!appVersion) return;
    const lifetime = new AbortController();
    const checkVersion = async () => {
      try {
        const config = await fetchAppConfig(API_BASE, fetchImpl, { timeoutMs: APP_CONFIG_TIMEOUT_MS });
        if (lifetime.signal.aborted) return;
        setGate(
          isUpdateRequired(appVersion, config.minimumVersion)
            ? {
                status: 'update-required',
                minimumVersion: config.minimumVersion,
                latestVersion: config.latestVersion,
              }
            : { status: 'ok' },
        );
      } catch {
        if (!lifetime.signal.aborted) setGate({ status: 'ok' });
      }
    };
    void checkVersion();
    return () => lifetime.abort();
  }, [appVersion, fetchImpl]);

  return gate;
}
