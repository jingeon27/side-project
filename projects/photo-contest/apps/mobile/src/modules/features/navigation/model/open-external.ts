import { openURL } from 'expo-linking';

/**
 * 웹 밖으로 나가는 링크(다른 사이트·카카오톡·전화 등)를 시스템에 맡긴다.
 * 대상 앱이 없어 실패하면 대체 주소(브라우저·스토어)를 열고, 그것도 안 되면 조용히 끝낸다.
 */
export async function openExternalUrl(url: string, fallbackUrl: string | null) {
  try {
    await openURL(url);
  } catch {
    if (fallbackUrl) await openURL(fallbackUrl).catch(() => undefined);
  }
}
