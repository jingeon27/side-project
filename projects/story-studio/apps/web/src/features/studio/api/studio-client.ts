import { trackStudioEvent, type TStudioAction } from '../../../shared/analytics';

export type TConfiguration = {
  configured: boolean;
  textModel: string;
  imageModel: string;
  videoModel: string;
  provider?: 'local' | 'cloud';
  voiceModel?: string;
  materialModel?: string;
  textReady?: boolean;
  voiceReady?: boolean;
  voiceTrainingReady?: boolean;
  imageReady?: boolean;
  videoReady?: boolean;
  demoReady?: boolean;
};

export async function getStudioConfiguration(signal: AbortSignal): Promise<TConfiguration> {
  const response = await fetch('/api/studio', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('AI 연결 상태를 확인하지 못했습니다. 서버가 실행 중인지 확인해 주세요.');
  return response.json();
}

export async function requestStudio(
  action: TStudioAction,
  input: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  void trackStudioEvent('studio_request_clicked', { action });
  const response = await fetch('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, input }),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(typeof data.error === 'string' ? data.error : '요청을 처리하지 못했습니다.');
  void trackStudioEvent('studio_request_succeeded', { action });
  return data;
}
