import { ImageOff } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';

/** 앱바가 없는 화면이라 안내 제목을 페이지의 h1로 둔다. 모양은 EmptyState와 같다. */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div aria-hidden className="mb-2 flex size-16 items-center justify-center text-muted">
        <ImageOff className="size-8" />
      </div>
      <h1 className="text-subtitle text-ink">페이지를 찾을 수 없어요</h1>
      <p className="text-body text-muted">주소가 바뀌었거나 볼 수 없는 화면이에요.</p>
      <div className="mt-3">
        <ButtonLink href={ROUTES.HOME}>홈으로 가기</ButtonLink>
      </div>
    </div>
  );
}
