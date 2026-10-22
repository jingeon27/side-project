'use client';

import { useLazyQuery } from '@apollo/client/react';
import { Download } from 'lucide-react';

import { PostDownloadDocument } from '@/shared/api/generated';
import { useBridge, useExternalLink } from '@/shared/model/bridge';
import { getErrorMessage } from '@/shared/model/error';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';

interface IPostDownloadButtonProps {
  postId: string;
  title: string;
  mediaUrl: string;
}

export function PostDownloadButton({ postId, title, mediaUrl }: IPostDownloadButtonProps) {
  const [download, { loading }] = useLazyQuery(PostDownloadDocument, { fetchPolicy: 'no-cache' });
  const bridge = useBridge();
  const external = useExternalLink();
  return (
    <Button
      variant="ghost"
      size="md"
      className="gap-2 px-3 text-muted"
      aria-label={`${title} 파일 저장`}
      loading={loading}
      onClick={async () => {
        try {
          const { data } = await download({ variables: { postId } });
          if (!data) return;
          const file = data.postDownload;
          // 앱의 시스템 브라우저에는 세션을 넘기지 않고 발급된 짧은 다운로드 권한만 전달한다.
          if (bridge?.supports('link.open')) {
            await external.open(file.url);
            return;
          }
          // 다른 origin 서명 URL에는 download 속성이 무시돼 WebKit이 파일을 화면에 연다. 웹은 세션으로 권한을
          // 확인하고 서명 GET으로 보내는 같은 origin 고정 경로를 내려받는다.
          const anchor = document.createElement('a');
          anchor.href = `${mediaUrl}/download`;
          anchor.download = file.filename;
          anchor.rel = 'noopener';
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
        } catch (error) {
          toast.error(getErrorMessage(error));
        }
      }}
    >
      <Download aria-hidden className="size-4" /> 저장
    </Button>
  );
}
