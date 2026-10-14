import { useMemo } from 'react';
import { match } from 'ts-pattern';

import { SHARE_METHOD } from '@/shared/model/analytics';
import type { TShareMethod } from '@/shared/model/analytics';
import { SHARE_OUTCOME, useBridge, useShareLink } from '@/shared/model/bridge';
import type { IShareContent } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';

interface IShareMessages {
  /** 공유할 수 없어 복사로 대신했을 때·복사했을 때 */
  copied: string;
}

const SHARE_FAILED = '공유하지 못했어요. 링크를 직접 복사해 주세요.';
const COPY_FAILED = '복사하지 못했어요. 링크를 길게 눌러 직접 복사해 주세요.';

/**
 * 공유·복사와 결과 안내(토스트)를 한곳에서 처리한다. 성공하면 분석 이벤트에 쓸 방법(native | web_share | clipboard)을,
 * 사용자가 공유 시트를 닫았거나 실패하면 null을 돌려준다(이벤트를 보내지 않는다).
 */
export function useShareActions() {
  const bridge = useBridge();
  const { share, copy } = useShareLink();

  return useMemo(
    () => ({
      share: async (url: string, content: IShareContent, messages: IShareMessages) =>
        match(await share(url, content))
          .returnType<TShareMethod | null>()
          .with(SHARE_OUTCOME.Shared, () =>
            bridge?.supports('share.open') ? SHARE_METHOD.Native : SHARE_METHOD.WebShare,
          )
          .with(SHARE_OUTCOME.Copied, () => {
            toast.success(messages.copied);
            return SHARE_METHOD.Clipboard;
          })
          .with(SHARE_OUTCOME.Cancelled, () => null)
          .with(SHARE_OUTCOME.Failed, () => {
            toast.error(SHARE_FAILED);
            return null;
          })
          .exhaustive(),
      copy: async (text: string, messages: IShareMessages): Promise<TShareMethod | null> => {
        if (!(await copy(text))) {
          toast.error(COPY_FAILED);
          return null;
        }
        toast.success(messages.copied);
        return bridge?.supports('clipboard.copy') ? SHARE_METHOD.Native : SHARE_METHOD.Clipboard;
      },
    }),
    [bridge, share, copy],
  );
}
